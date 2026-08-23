import { APP_ID, CURRENT_SCHEMA_VERSION } from "../config/constants.js";
import { getFinanceRuntime } from "../config/runtime.js";
import { cloneState, createInitialState } from "../state/initial-state.js";
import { areFinanceStatesEquivalent } from "./sync-policy.js";
import { isValidImportShape } from "./import-export.js";
import { createLatestWriteQueue } from "./latest-write-queue.js";
import {
  SYNC_SCHEMA_VERSION,
  applyMutations,
  buildRecordMutations,
  mapSnapshotRecords,
  recordEnvelopesToState,
  recordFingerprint,
  stateToRecordSpecs,
} from "./record-codec.js";

const RECORD_BATCH_LIMIT = 400;
const DEVICE_ID_KEY = "fin_v7:sync:device-id";
const OUTBOX_PREFIX = "fin_v7:sync:outbox:";

function toUserProfile(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName || "",
    email: user.email || "",
  };
}

function createClientId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDeviceId(storage = globalThis.localStorage) {
  const existing = storage?.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = createClientId("device");
  storage?.setItem(DEVICE_ID_KEY, created);
  return created;
}

function outboxKey(uid) {
  return `${OUTBOX_PREFIX}${encodeURIComponent(uid)}`;
}

function readOutbox(uid, storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(outboxKey(uid)) || "null");
  } catch (error) {
    console.warn("Cloud outbox metadata failed to parse.", error);
    return null;
  }
}

function writeOutbox(uid, value, storage = globalThis.localStorage) {
  if (!storage) return;
  if (!value) {
    storage.removeItem(outboxKey(uid));
    return;
  }
  storage.setItem(outboxKey(uid), JSON.stringify(value));
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
    getUser: () => null,
    destroy: () => {},
  };
}

function mapsEquivalent(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (!other || Number(other.revision) !== Number(value.revision) || recordFingerprint(other) !== recordFingerprint(value)) return false;
  }
  return true;
}

function mergeRecordMapsByRevision(left, right) {
  const merged = new Map();
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    const leftRecord = left.get(key);
    const rightRecord = right.get(key);
    if (!leftRecord) {
      merged.set(key, rightRecord);
      continue;
    }
    if (!rightRecord) {
      merged.set(key, leftRecord);
      continue;
    }
    const leftRevision = Number(leftRecord.revision || 0);
    const rightRevision = Number(rightRecord.revision || 0);
    if (leftRevision > rightRevision) {
      merged.set(key, leftRecord);
      continue;
    }
    if (rightRevision > leftRevision) {
      merged.set(key, rightRecord);
      continue;
    }
    if (recordFingerprint(leftRecord) !== recordFingerprint(rightRecord)) {
      throw new Error(`equal-revision-record-mismatch:${key}`);
    }
    merged.set(key, rightRecord);
  }
  return merged;
}

function serializeOutboxMutations(mutations) {
  return mutations.map(({ key, baseRevision, envelope }) => ({
    key,
    baseRevision,
    envelope: {
      ...envelope,
      updatedAt: null,
      deletedAt: envelope.deleted ? null : envelope.deletedAt,
    },
  }));
}

function buildConflictResolutionState(context, choice) {
  const localSpecs = stateToRecordSpecs(context.localState);
  const merged = new Map(context.remoteRecords);
  const selectedKeys = choice === "local"
    ? context.mutationKeys
    : context.mutationKeys.filter((key) => !context.conflictKeys.includes(key));

  selectedKeys.forEach((key) => {
    const localRecord = localSpecs.get(key);
    const remoteRecord = merged.get(key);
    if (localRecord) {
      merged.set(key, {
        ...localRecord,
        revision: Number(remoteRecord?.revision || 0),
        deleted: false,
      });
      return;
    }
    if (remoteRecord) {
      merged.set(key, {
        ...remoteRecord,
        payload: null,
        deleted: true,
      });
    }
  });

  return {
    state: materializeValidatedRecords(merged),
    selectedKeys,
  };
}

function sourceFingerprint(state) {
  const canonical = [...stateToRecordSpecs(state).entries()]
    .map(([key, record]) => `${key}:${recordFingerprint(record)}`)
    .sort()
    .join("|");
  let hash = 14695981039346656037n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = (hash * 1099511628211n) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function materializeValidatedRecords(records) {
  const state = recordEnvelopesToState(records);
  if (!isValidImportShape(state)) throw new Error("invalid-cloud-record-state");
  return state;
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

    const refsFor = (uid) => {
      const legacy = firestoreMod.doc(db, "artifacts", appId, "users", uid, "data", "finance_v6");
      const meta = firestoreMod.doc(db, "artifacts", appId, "users", uid, "sync", "finance_v7");
      const records = firestoreMod.collection(db, "artifacts", appId, "users", uid, "sync", "finance_v7", "records");
      return { legacy, meta, records };
    };

    const writeBatches = async (recordsRef, mutations) => {
      for (let offset = 0; offset < mutations.length; offset += RECORD_BATCH_LIMIT) {
        const batch = firestoreMod.writeBatch(db);
        for (const mutation of mutations.slice(offset, offset + RECORD_BATCH_LIMIT)) {
          batch.set(firestoreMod.doc(recordsRef, mutation.key), mutation.envelope);
        }
        await batch.commit();
      }
    };

    const writeMutationGroup = async (recordsRef, mutations) => {
      await writeBatches(recordsRef, mutations);
    };

    const activateMigration = async (uid, generation, state, refs) => {
      if (!isValidImportShape(state)) throw new Error("invalid-migration-state");
      const migrationId = createClientId("migration");
      let migrationState = state;
      let sourceHash = sourceFingerprint(migrationState);
      const claimedMigrationId = await firestoreMod.runTransaction(db, async (transaction) => {
        const current = await transaction.get(refs.meta);
        const data = current.exists() ? current.data() : null;
        if (data?.status === "active") return "";
        if (data?.status === "preparing" && data.ownerDeviceId !== deviceId) {
          throw new Error("migration-in-progress");
        }
        if (data?.status === "preparing" && data.migrationSourceHash !== sourceHash) {
          throw new Error("migration-source-changed");
        }
        const claimedId = data?.migrationId || migrationId;
        transaction.set(refs.meta, {
          status: "preparing",
          migrationId: claimedId,
          migrationSourceHash: data?.migrationSourceHash || sourceHash,
          ownerDeviceId: deviceId,
          syncSchemaVersion: SYNC_SCHEMA_VERSION,
          stateSchemaVersion: CURRENT_SCHEMA_VERSION,
          updatedAt: firestoreMod.serverTimestamp(),
        });
        return claimedId;
      });
      if (!claimedMigrationId) return;
      if (!isCurrent(uid, generation)) return;

      const fencedLegacySnapshot = await firestoreMod.getDoc(refs.legacy);
      if (initialLegacyFingerprint) {
        const latestLegacyState = fencedLegacySnapshot.exists()
          ? fencedLegacySnapshot.data()
          : createInitialState();
        if (!isValidImportShape(latestLegacyState)) throw new Error("invalid-fenced-legacy-state");
        const latestLegacyHash = sourceFingerprint(latestLegacyState);
        if (latestLegacyHash !== initialLegacyFingerprint) {
          if (sourceHash !== initialLegacyFingerprint) {
            throw new Error("legacy-changed-before-cutover");
          }
          migrationState = latestLegacyState;
          sourceHash = latestLegacyHash;
          await firestoreMod.setDoc(refs.meta, {
            status: "preparing",
            migrationId: claimedMigrationId,
            migrationSourceHash: sourceHash,
            ownerDeviceId: deviceId,
            syncSchemaVersion: SYNC_SCHEMA_VERSION,
            stateSchemaVersion: CURRENT_SCHEMA_VERSION,
            updatedAt: firestoreMod.serverTimestamp(),
          });
        }
      }

      const existingSnapshot = await firestoreMod.getDocs(refs.records);
      const existing = mapSnapshotRecords(existingSnapshot);
      const initialMutations = buildRecordMutations(migrationState, new Map(), {
        updatedBy: deviceId,
        updatedAt: firestoreMod.serverTimestamp(),
        migrationId: claimedMigrationId,
      }).filter((mutation) => {
        const present = existing.get(mutation.key);
        if (!present) return true;
        if (present.revision === 1 && recordFingerprint(present) === recordFingerprint(mutation.envelope)) return false;
        throw new Error(`migration-record-conflict:${mutation.key}`);
      });
      await writeBatches(refs.records, initialMutations);

      const expectedCount = stateToRecordSpecs(migrationState).size;
      const verifiedSnapshot = await firestoreMod.getDocs(refs.records);
      const verified = mapSnapshotRecords(verifiedSnapshot);
      if (verified.size !== expectedCount) throw new Error("migration-record-count-mismatch");
      const roundTrip = materializeValidatedRecords(verified);
      if (!areFinanceStatesEquivalent(migrationState, roundTrip)) throw new Error("migration-round-trip-mismatch");

      await firestoreMod.setDoc(refs.meta, {
        status: "active",
        migrationId: claimedMigrationId,
        migrationSourceHash: sourceHash,
        ownerDeviceId: deviceId,
        syncSchemaVersion: SYNC_SCHEMA_VERSION,
        stateSchemaVersion: CURRENT_SCHEMA_VERSION,
        recordCount: verified.size,
        updatedAt: firestoreMod.serverTimestamp(),
      });
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
          await activateMigration(uid, generation, state, refs);
          writeOutbox(uid, null);
          if (isCurrent(uid, generation)) await attachActiveRecords(uid, generation, refs);
          return;
        }

        const mutations = buildRecordMutations(state, workingRecords, {
          updatedBy: deviceId,
          updatedAt: firestoreMod.serverTimestamp(),
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
          await writeMutationGroup(refs.records, mutations);
          writeOutbox(uid, null);
          if (!isCurrent(uid, generation)) return;
          baselineRecords = applyMutations(baselineRecords, mutations);
          pendingMutationGroup = null;
        } catch (error) {
          const latestSnapshot = await firestoreMod.getDocs(refs.records);
          const latestRecords = mapSnapshotRecords(latestSnapshot);
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

      unsubscribeRecords = firestoreMod.onSnapshot(
        refs.records,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!isCurrent(uid, generation)) return;
          if (snapshot.metadata?.hasPendingWrites) {
            onStatus("syncing", snapshot.metadata);
            return;
          }
          let incoming;
          try {
            incoming = mapSnapshotRecords(snapshot);
          } catch (error) {
            console.warn("Cloud record snapshot validation failed.", error);
            onStatus("error");
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
            onStatus(isBrowserOnline() ? "online" : "offline", snapshot.metadata);
            return;
          }
          if (saveQueue?.isActive() || pendingMutationGroup) {
            deferredRecords = mergeRecordMapsByRevision(deferredRecords || new Map(), incoming);
            return;
          }
          if (mapsEquivalent(baselineRecords, incoming)) {
            onStatus(isBrowserOnline() ? "online" : "offline", snapshot.metadata);
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
          onStatus(isBrowserOnline() ? "online" : "offline", snapshot.metadata);
        },
        () => {
          if (isCurrent(uid, generation)) onStatus("error");
        },
      );
    };

    const initializeUser = async (uid, generation) => {
      const refs = refsFor(uid);
      onStatus("syncing");
      try {
        const metaSnapshot = await firestoreMod.getDoc(refs.meta);
        if (!isCurrent(uid, generation)) return;
        if (metaSnapshot.exists() && metaSnapshot.data()?.status === "active") {
          await attachActiveRecords(uid, generation, refs);
          return;
        }
        syncMode = "migration";
        saveQueue = createQueue(uid, generation, refs);
        const legacySnapshot = await firestoreMod.getDoc(refs.legacy);
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
  buildConflictResolutionState,
  mergeRecordMapsByRevision,
};
