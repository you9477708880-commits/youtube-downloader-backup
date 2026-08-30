import { APP_ID } from "../config/constants.js";
import { getFinanceRuntime } from "../config/runtime.js";
import { cloneState, createInitialState } from "../state/initial-state.js";
import { areFinanceStatesEquivalent } from "./sync-policy.js";
import { isValidImportShape } from "./import-export.js";
import { createLatestWriteQueue } from "./latest-write-queue.js";
import {
  applyMutations,
  buildRecordMutations,
  recordFingerprint,
} from "./record-codec.js";
import { createFirestoreRecordAdapter } from "./firestore-record-adapter.js";
import {
  cloudOutboxStorageKey,
  getDeviceId,
  outboxKey,
  readOutbox,
  writeOutbox,
} from "./record-sync-local-store.js";
import {
  buildConflictResolutionState,
  mapsEquivalent,
  materializeValidatedRecords,
  mergeRecordMapsByRevision,
  serializeOutboxMutations,
  sourceFingerprint,
} from "./record-sync-protocol.js";

export { cloudOutboxStorageKey };

function toUserProfile(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName || "",
    email: user.email || "",
  };
}

function isBrowserOnline() {
  return globalThis.navigator?.onLine !== false;
}

function waitForAuthUser(authMod, auth, predicate, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("auth-state-timeout"));
    }, timeoutMs);
    const unsubscribe = authMod.onAuthStateChanged(auth, (user) => {
      if (!predicate(user)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(user);
    });
  });
}

function createDisabledCloudSync(error = "") {
  return {
    enabled: false,
    error,
    save: async () => {},
    resolveConflict: async () => false,
    signInWithGoogle: async () => false,
    signOutToAnonymous: async () => false,
    getDeviceClearStatus: () => ({
      uid: "",
      signedIn: false,
      queueActive: false,
      hasPendingOutbox: false,
      conflict: false,
    }),
    clearDevicePersistence: async () => { throw new Error("device-clear-cloud-disabled"); },
    getUser: () => null,
    destroy: () => {},
  };
}

export async function createRecordCloudSync({
  onRemoteState,
  onStatus,
  onUserChange,
  onConflict,
  getState,
  firebaseModules = null,
}) {
  try {
    const runtime = getFinanceRuntime();
    if (!runtime.cloudEnabled) return createDisabledCloudSync("Cloud disabled by runtime");
    const globalConfig = globalThis.__firebase_config || "{}";
    const firebaseConfig = typeof globalConfig === "string" ? JSON.parse(globalConfig) : globalConfig;
    const appId = globalThis.__app_id || APP_ID;
    if (!firebaseConfig?.projectId || !firebaseConfig?.apiKey) return createDisabledCloudSync("Missing firebaseConfig");

    const [appMod, authMod, firestoreMod] = firebaseModules
      ? [firebaseModules.app, firebaseModules.auth, firebaseModules.firestore]
      : await Promise.all([
          import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"),
          import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"),
        ]);

    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = firestoreMod.initializeFirestore(app, {
      localCache: firestoreMod.persistentLocalCache({
        tabManager: firestoreMod.persistentMultipleTabManager(),
      }),
    });
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const deviceId = getDeviceId();
    const recordAdapter = createFirestoreRecordAdapter({ firestoreMod, db, appId, deviceId });

    let currentUser = null;
    let userId = "";
    let authGeneration = 0;
    let authTransitioning = false;
    let unsubscribeAuth = null;
    let unsubscribeRecords = null;
    let saveQueue = null;
    let saveReady = false;
    let syncMode = "none";
    let baselineRecords = new Map();
    let workingRecords = new Map();
    let deferredRecords = null;
    let conflictContext = null;
    let pendingMutationGroup = null;
    let initialLegacyFingerprint = "";
    let initialIdentityResolved = false;
    let resolveInitialIdentity;
    const initialIdentityReady = new Promise((resolve) => {
      resolveInitialIdentity = resolve;
    });

    const markInitialIdentityReady = () => {
      if (initialIdentityResolved) return;
      initialIdentityResolved = true;
      resolveInitialIdentity();
    };

    const isCurrent = (uid, generation) =>
      userId === uid && authGeneration === generation && auth.currentUser?.uid === uid;

    const emitUser = (user) => {
      currentUser = user;
      onUserChange?.(toUserProfile(user));
    };

    const clearUserSync = () => {
      unsubscribeRecords?.();
      unsubscribeRecords = null;
      saveQueue?.destroy();
      saveQueue = null;
      saveReady = false;
      syncMode = "none";
      baselineRecords = new Map();
      workingRecords = new Map();
      deferredRecords = null;
      conflictContext = null;
      pendingMutationGroup = null;
      initialLegacyFingerprint = "";
    };

    const notifyConflict = (uid, remoteRecords, localState, conflictKeys, mutationKeys) => {
      conflictContext = { uid, remoteRecords, localState, conflictKeys, mutationKeys };
      onStatus("conflict");
      onConflict?.({
        keys: [...conflictKeys],
        localState: cloneState(localState),
        remoteState: materializeValidatedRecords(remoteRecords),
      });
    };

    const createQueue = (uid, generation, refs) => createLatestWriteQueue({
      write: async (state) => {
        if (!isCurrent(uid, generation) || conflictContext) return;
        if (syncMode === "migration") {
          writeOutbox(uid, { pending: true, mode: "migration", savedAt: new Date().toISOString() });
          await recordAdapter.activateMigration({
            uid,
            generation,
            state,
            refs,
            isCurrent,
            initialLegacyFingerprint,
          });
          writeOutbox(uid, null);
          if (isCurrent(uid, generation)) await attachActiveRecords(uid, generation, refs);
          return;
        }

        const mutations = buildRecordMutations(state, workingRecords, {
          updatedBy: deviceId,
          updatedAt: recordAdapter.serverTimestamp(),
        });
        if (!mutations.length) return;
        writeOutbox(uid, {
          pending: true,
          mode: "records",
          baseRevisions: Object.fromEntries(mutations.map((item) => [item.key, item.baseRevision])),
          mutations: serializeOutboxMutations(mutations),
          savedAt: new Date().toISOString(),
        });
        pendingMutationGroup = { state: cloneState(state), mutations };
        workingRecords = applyMutations(workingRecords, mutations);
        try {
          await recordAdapter.writeMutationGroup(refs, mutations);
          writeOutbox(uid, null);
          if (!isCurrent(uid, generation)) return;
          baselineRecords = applyMutations(baselineRecords, mutations);
          pendingMutationGroup = null;
        } catch (error) {
          const latestRecords = await recordAdapter.readRecords(refs);
          if (isCurrent(uid, generation)) {
            baselineRecords = mergeRecordMapsByRevision(baselineRecords, latestRecords);
            workingRecords = baselineRecords;
          }
          const conflictKeys = mutations
            .filter(({ key, baseRevision, envelope }) => {
              const latest = latestRecords.get(key);
              return Number(latest?.revision || 0) > baseRevision && recordFingerprint(latest) !== recordFingerprint(envelope);
            })
            .map(({ key }) => key);
          if (conflictKeys.length) {
            if (isCurrent(uid, generation)) {
              notifyConflict(uid, latestRecords, state, conflictKeys, mutations.map(({ key }) => key));
            }
            return;
          }
          if (isCurrent(uid, generation)) deferredRecords = mergeRecordMapsByRevision(deferredRecords || new Map(), latestRecords);
          throw error;
        }
      },
      onStart: () => {
        if (isCurrent(uid, generation)) onStatus("syncing");
      },
      onIdle: (error) => {
        if (!isCurrent(uid, generation)) return;
        if (error) {
          onStatus("error");
          return;
        }
        if (conflictContext) return;
        if (deferredRecords && !pendingMutationGroup) {
          const records = deferredRecords;
          deferredRecords = null;
          try {
            materializeValidatedRecords(records);
          } catch (validationError) {
            console.warn("Deferred cloud records failed validation.", validationError);
            onStatus("error");
            return;
          }
          const reconciled = mergeRecordMapsByRevision(records, baselineRecords);
          baselineRecords = reconciled;
          workingRecords = reconciled;
          const reconciledState = materializeValidatedRecords(reconciled);
          if (!areFinanceStatesEquivalent(getState(), reconciledState)) {
            onRemoteState(reconciledState, { source: "records", initial: false });
          }
        }
        onStatus(isBrowserOnline() ? "online" : "offline");
      },
    });

    const attachActiveRecords = async (uid, generation, refs) => {
      unsubscribeRecords?.();
      saveQueue?.destroy();
      syncMode = "records";
      saveReady = false;
      saveQueue = createQueue(uid, generation, refs);
      let initialSnapshot = true;

      unsubscribeRecords = recordAdapter.listenRecords(
        refs,
        (incoming, metadata) => {
          if (!isCurrent(uid, generation)) return;
          if (metadata.hasPendingWrites) {
            onStatus("syncing", metadata);
            return;
          }
          if (initialSnapshot) {
            let initialRemoteState;
            try {
              initialRemoteState = materializeValidatedRecords(incoming);
            } catch (validationError) {
              console.warn("Initial cloud records failed validation.", validationError);
              onStatus("error");
              return;
            }
            initialSnapshot = false;
            baselineRecords = incoming;
            workingRecords = incoming;
            saveReady = true;
            const pendingOutbox = readOutbox(uid);
            if (pendingOutbox && areFinanceStatesEquivalent(getState(), initialRemoteState)) {
              writeOutbox(uid, null);
            }
            onRemoteState(initialRemoteState, {
              source: "records",
              initial: true,
              hasPendingOutbox: Boolean(pendingOutbox),
            });
            onStatus(isBrowserOnline() ? "online" : "offline", metadata);
            return;
          }
          if (saveQueue?.isActive() || pendingMutationGroup) {
            deferredRecords = mergeRecordMapsByRevision(deferredRecords || new Map(), incoming);
            return;
          }
          if (mapsEquivalent(baselineRecords, incoming)) {
            onStatus(isBrowserOnline() ? "online" : "offline", metadata);
            return;
          }
          let reconciled;
          let remoteState;
          try {
            reconciled = mergeRecordMapsByRevision(incoming, baselineRecords);
            remoteState = materializeValidatedRecords(reconciled);
          } catch (validationError) {
            console.warn("Cloud records failed validation.", validationError);
            onStatus("error");
            return;
          }
          baselineRecords = reconciled;
          workingRecords = reconciled;
          if (!areFinanceStatesEquivalent(getState(), remoteState)) {
            onRemoteState(remoteState, { source: "records", initial: false });
          }
          onStatus(isBrowserOnline() ? "online" : "offline", metadata);
        },
        (error) => {
          if (!isCurrent(uid, generation)) return;
          console.warn("Cloud record snapshot validation or listener failed.", error);
          onStatus("error");
        },
      );
    };

    const initializeUser = async (uid, generation) => {
      const refs = recordAdapter.refsFor(uid);
      onStatus("syncing");
      try {
        const metaSnapshot = await recordAdapter.readMeta(refs);
        if (!isCurrent(uid, generation)) return;
        if (metaSnapshot.exists() && metaSnapshot.data()?.status === "active") {
          await attachActiveRecords(uid, generation, refs);
          return;
        }
        syncMode = "migration";
        saveQueue = createQueue(uid, generation, refs);
        const legacySnapshot = await recordAdapter.readLegacy(refs);
        if (!isCurrent(uid, generation)) return;
        saveReady = true;
        const initialLegacyState = legacySnapshot.exists() ? legacySnapshot.data() : createInitialState();
        if (!isValidImportShape(initialLegacyState)) throw new Error("invalid-legacy-cloud-state");
        initialLegacyFingerprint = sourceFingerprint(initialLegacyState);
        onRemoteState(
          initialLegacyState,
          {
            source: legacySnapshot.exists() ? "legacy" : "empty",
            initial: true,
            migrationRequired: true,
            hasPendingOutbox: Boolean(readOutbox(uid)),
          },
        );
      } catch (error) {
        console.warn("Record cloud initialization failed.", error);
        if (isCurrent(uid, generation)) onStatus("error");
      }
    };

    const save = async () => {
      if (!userId || !saveReady || !saveQueue || conflictContext || auth.currentUser?.uid !== userId) return false;
      await saveQueue.enqueue(cloneState(getState()));
      return true;
    };

    const getDeviceClearStatus = () => {
      const uid = currentUser && !currentUser.isAnonymous ? String(currentUser.uid || "") : "";
      return {
        uid,
        signedIn: Boolean(uid),
        queueActive: Boolean(saveQueue?.isActive()),
        hasPendingOutbox: Boolean(uid && readOutbox(uid)),
        conflict: Boolean(conflictContext),
      };
    };

    const clearDevicePersistence = async ({ expectedUid = "", allowDiscardUnsynced = false } = {}) => {
      const status = getDeviceClearStatus();
      if (!status.signedIn || !status.uid) throw new Error("device-clear-signed-in-user-required");
      if (expectedUid && status.uid !== String(expectedUid)) throw new Error("device-clear-user-changed");
      if (!allowDiscardUnsynced && (status.queueActive || status.hasPendingOutbox || status.conflict)) {
        throw new Error("device-clear-unsynced-acknowledgement-required");
      }

      authGeneration += 1;
      clearUserSync();
      unsubscribeAuth?.();
      unsubscribeAuth = null;
      await authMod.signOut(auth);
      currentUser = null;
      userId = "";
      await recordAdapter.clearPersistence();
      return { cleared: true, uid: status.uid };
    };

    const resolveConflict = async (choice) => {
      const context = conflictContext;
      if (!context || context.uid !== userId) return false;
      if (choice === "cloud" || choice === "local") {
        conflictContext = null;
        const resolution = buildConflictResolutionState(context, choice);
        baselineRecords = context.remoteRecords;
        workingRecords = context.remoteRecords;
        pendingMutationGroup = null;
        writeOutbox(userId, null);
        onRemoteState(resolution.state, { source: "conflict-resolution" });
        if (resolution.selectedKeys.length) {
          onStatus("syncing");
          await saveQueue.enqueue(resolution.state);
        } else {
          onStatus("online");
        }
        return true;
      }
      onStatus("conflict");
      return false;
    };

    unsubscribeAuth = authMod.onAuthStateChanged(auth, (user) => {
      const generation = ++authGeneration;
      clearUserSync();
      if (!user || user.isAnonymous) {
        userId = "";
        emitUser(user || null);
        onStatus("local");
        markInitialIdentityReady();
        return;
      }
      userId = user.uid;
      emitUser(user);
      markInitialIdentityReady();
      initializeUser(user.uid, generation);
    });

    const initAuth = async () => {
      if (globalThis.__initial_auth_token) {
        await authMod.signInWithCustomToken(auth, globalThis.__initial_auth_token);
      } else {
        // Firebase restores persisted credentials asynchronously. Wait before
        // falling back to an anonymous user so a reload cannot replace a
        // valid Google session.
        await auth.authStateReady?.();
        if (!auth.currentUser) await authMod.signInAnonymously(auth);
      }
    };
    initAuth().catch((error) => {
      console.warn("Firebase auth init failed.", error);
      onStatus("local");
      emitUser(null);
      markInitialIdentityReady();
    });
    await Promise.race([
      initialIdentityReady,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    if (!initialIdentityResolved) {
      emitUser(null);
      onStatus("local");
      markInitialIdentityReady();
    }

    return {
      enabled: true,
      error: "",
      save,
      resolveConflict,
      getDeviceClearStatus,
      clearDevicePersistence,
      signInWithGoogle: async () => {
        authTransitioning = true;
        try {
          const activeUser = auth.currentUser;
          if (activeUser?.isAnonymous) {
            try {
              await authMod.linkWithPopup(activeUser, provider);
            } catch (error) {
              const code = error?.code || "";
              if (["auth/credential-already-in-use", "auth/email-already-in-use", "auth/account-exists-with-different-credential"].includes(code)) {
                await authMod.signInWithPopup(auth, provider);
              } else {
                throw error;
              }
            }
          } else {
            await authMod.signInWithPopup(auth, provider);
          }
        } finally {
          authTransitioning = false;
        }
        return true;
      },
      signOutToAnonymous: async () => {
        authTransitioning = true;
        try {
          clearUserSync();
          onStatus("local");
          await authMod.signOut(auth);
          try {
            await authMod.signInAnonymously(auth);
            await waitForAuthUser(authMod, auth, (user) => Boolean(user?.isAnonymous));
            return { mode: "anonymous" };
          } catch (error) {
            if (auth.currentUser?.isAnonymous) return { mode: "anonymous" };
            emitUser(null);
            return { mode: "local" };
          }
        } finally {
          authTransitioning = false;
        }
      },
      getUser: () => toUserProfile(currentUser),
      destroy: () => {
        authGeneration += 1;
        clearUserSync();
        unsubscribeAuth?.();
        unsubscribeAuth = null;
      },
    };
  } catch (error) {
    console.warn("Record cloud sync failed to initialize.", error);
    return createDisabledCloudSync(`${error?.code || error?.name || "FirebaseError"}: ${error?.message || String(error)}`);
  }
}

export const __recordCloudTestUtils = {
  outboxKey,
  getDeviceId,
  mapsEquivalent,
  buildConflictResolutionState,
  mergeRecordMapsByRevision,
  serializeOutboxMutations,
  sourceFingerprint,
};
