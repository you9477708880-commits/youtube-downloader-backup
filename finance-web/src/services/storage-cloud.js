import { APP_ID } from "../config/constants.js";
import { cloneState } from "../state/initial-state.js";
import { areFinanceStatesEquivalent } from "./sync-policy.js";
import { createLatestWriteQueue } from "./latest-write-queue.js";

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
      if (predicate(user)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(user);
      }
    });
  });
}

export async function createCloudSync({ onRemoteState, onStatus, onUserChange, getState, firebaseModules = null }) {
  try {
    const globalConfig = globalThis.__firebase_config || "{}";
    const firebaseConfig = typeof globalConfig === "string" ? JSON.parse(globalConfig) : globalConfig;
    const appId = globalThis.__app_id || APP_ID;

    if (!firebaseConfig?.projectId || !firebaseConfig?.apiKey) {
      return {
        enabled: false,
        error: "Missing firebaseConfig",
        save: async () => {},
        signInWithGoogle: async () => false,
        signOutToAnonymous: async () => false,
        getUser: () => null,
        destroy: () => {},
      };
    }

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

    let userId = null;
    let currentUser = null;
    let syncing = false;
    let authTransitioning = false;
    let authGeneration = 0;
    let saveQueue = null;
    let saveReady = false;
    let deferredRemoteSnapshot = null;
    let unsubscribeSnapshot = null;
    let unsubscribeAuth = null;

    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    const emitUser = (user) => {
      currentUser = user;
      onUserChange?.(toUserProfile(user));
    };

    const clearSnapshot = () => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }
      saveQueue?.destroy();
      saveQueue = null;
      saveReady = false;
      deferredRemoteSnapshot = null;
      syncing = false;
    };

    const save = async () => {
      const activeQueue = saveQueue;
      if (!userId || !activeQueue || !saveReady || auth.currentUser?.uid !== userId) return;
      await activeQueue.enqueue(cloneState(getState()));
    };

    const attachSnapshot = (uid, generation) => {
      clearSnapshot();
      onStatus("syncing");
      const docRef = firestoreMod.doc(db, "artifacts", appId, "users", uid, "data", "finance_v6");
      let userQueue = null;
      let submittedStates = [];
      let initialRemoteResolved = false;
      let initialDocumentCreateRequested = false;
      userQueue = createLatestWriteQueue({
        write: async (state) => {
          submittedStates.push(state);
          if (submittedStates.length > 10) submittedStates = submittedStates.slice(-10);
          try {
            await firestoreMod.setDoc(docRef, state);
          } catch (error) {
            submittedStates = submittedStates.filter((item) => item !== state);
            throw error;
          }
        },
        onStart: () => {
          if (saveQueue !== userQueue || generation !== authGeneration) return;
          syncing = true;
          onStatus("syncing");
        },
        onIdle: (error) => {
          if (saveQueue !== userQueue || generation !== authGeneration) return;
          syncing = false;

          if (error) {
            if (!authTransitioning && auth.currentUser?.uid === uid) onStatus("error");
            return;
          }

          if (submittedStates.length) {
            onStatus("syncing");
            return;
          }

          const pendingRemote = deferredRemoteSnapshot;
          deferredRemoteSnapshot = null;
          if (pendingRemote && !areFinanceStatesEquivalent(getState(), pendingRemote.state)) {
            onRemoteState(pendingRemote.state);
          }
          onStatus(isBrowserOnline() ? "online" : "offline", pendingRemote?.metadata);
        },
      });
      saveQueue = userQueue;

      unsubscribeSnapshot = firestoreMod.onSnapshot(
        docRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (saveQueue !== userQueue || generation !== authGeneration || auth.currentUser?.uid !== uid) return;

          if (snapshot.metadata.hasPendingWrites) {
            onStatus(syncing ? "syncing" : (isBrowserOnline() ? "online" : "offline"), snapshot.metadata);
            return;
          }

          if (!initialRemoteResolved) {
            initialRemoteResolved = true;
            saveReady = true;
          }

          if (snapshot.exists()) {
            const remoteState = snapshot.data();
            const submittedIndex = submittedStates.findIndex((state) => areFinanceStatesEquivalent(state, remoteState));
            if (submittedIndex >= 0) {
              submittedStates.splice(0, submittedIndex + 1);
              if (submittedStates.length === 0) {
                deferredRemoteSnapshot = null;
              }
              if (!syncing && submittedStates.length === 0) {
                onStatus(isBrowserOnline() ? "online" : "offline", snapshot.metadata);
              }
              return;
            }

            if (syncing || submittedStates.length) {
              deferredRemoteSnapshot = { state: remoteState, metadata: snapshot.metadata };
            } else if (!areFinanceStatesEquivalent(getState(), remoteState)) {
              onRemoteState(remoteState);
              onStatus("online", snapshot.metadata);
            } else {
              onStatus("online", snapshot.metadata);
            }
          } else {
            if (!initialDocumentCreateRequested) {
              initialDocumentCreateRequested = true;
              save().catch(() => {
                if (!authTransitioning && auth.currentUser?.uid === uid) onStatus("error");
              });
            }
          }
        },
        () => {
          if (saveQueue === userQueue && generation === authGeneration && !authTransitioning && auth.currentUser?.uid === uid) {
            onStatus("error");
          }
        },
      );
    };

    const initAuth = async () => {
      if (globalThis.__initial_auth_token) {
        await authMod.signInWithCustomToken(auth, globalThis.__initial_auth_token);
        return;
      }

      if (!auth.currentUser) {
        await authMod.signInAnonymously(auth);
      }
    };

    unsubscribeAuth = authMod.onAuthStateChanged(auth, (user) => {
      const generation = ++authGeneration;
      if (!user) {
        userId = null;
        clearSnapshot();
        emitUser(null);
        onStatus("local");
        return;
      }

      if (user.isAnonymous) {
        userId = null;
        clearSnapshot();
        emitUser(user);
        onStatus("local");
        return;
      }

      userId = user.uid;
      emitUser(user);
      attachSnapshot(user.uid, generation);
    });

    initAuth().catch((error) => {
      console.warn("Firebase auth init failed.", error);
      onStatus("local");
      onUserChange?.(null);
    });

    return {
      enabled: true,
      error: "",
      save: async () => {
        if (auth.currentUser?.isAnonymous) return;
        return save();
      },
      signInWithGoogle: async () => {
        authTransitioning = true;
        try {
          const activeUser = auth.currentUser;
          if (activeUser?.isAnonymous) {
            try {
              await authMod.linkWithPopup(activeUser, provider);
            } catch (error) {
              const code = error?.code || "";
              if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use" || code === "auth/account-exists-with-different-credential") {
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
          clearSnapshot();
          onStatus("local");
          await authMod.signOut(auth);
          try {
            await authMod.signInAnonymously(auth);
            await waitForAuthUser(authMod, auth, (user) => Boolean(user?.isAnonymous));
            return { mode: "anonymous" };
          } catch (error) {
            if (auth.currentUser?.isAnonymous) {
              return { mode: "anonymous" };
            }
            console.warn("Anonymous re-auth after sign-out failed; staying in local mode.", error);
            emitUser(null);
            onStatus("local");
            return { mode: "local" };
          }
        } finally {
          authTransitioning = false;
        }
      },
      getUser: () => toUserProfile(currentUser),
      destroy: () => {
        authGeneration += 1;
        clearSnapshot();
        if (unsubscribeAuth) {
          unsubscribeAuth();
          unsubscribeAuth = null;
        }
      },
    };
  } catch (error) {
    console.warn("Firebase Init failed, gracefully falling back to LocalStorage.", error);
    return {
      enabled: false,
      error: `${error?.code || error?.name || "FirebaseError"}: ${error?.message || String(error)}`,
      save: async () => {},
      signInWithGoogle: async () => false,
      signOutToAnonymous: async () => false,
      getUser: () => null,
      destroy: () => {},
    };
  }
}
