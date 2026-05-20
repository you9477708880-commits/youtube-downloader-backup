import { APP_ID } from "../config/constants.js";

function toUserProfile(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName || "",
    email: user.email || "",
  };
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

export async function createCloudSync({ onRemoteState, onStatus, onUserChange, getState }) {
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

    const [{ initializeApp }, authMod, firestoreMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"),
    ]);

    const app = initializeApp(firebaseConfig);
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
    let saveResolver = null;
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
      syncing = false;
    };

    const save = async () => {
      if (!userId) return;
      syncing = true;
      onStatus("syncing");
      const docRef = firestoreMod.doc(db, "artifacts", appId, "users", userId, "data", "finance_v6");
      await firestoreMod.setDoc(docRef, getState());
      syncing = false;
      onStatus(navigator.onLine ? "online" : "offline");
    };

    const attachSnapshot = (uid) => {
      clearSnapshot();
      onStatus("syncing");
      const docRef = firestoreMod.doc(db, "artifacts", appId, "users", uid, "data", "finance_v6");
      unsubscribeSnapshot = firestoreMod.onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists() && !syncing) {
            onRemoteState(snapshot.data());
            onStatus("online", snapshot.metadata);
          } else if (!snapshot.exists()) {
            save().catch(() => {
              if (!authTransitioning && auth.currentUser?.uid === uid) onStatus("error");
            });
          }

          if (saveResolver) {
            saveResolver();
            saveResolver = null;
          }
        },
        () => {
          if (!authTransitioning && auth.currentUser?.uid === uid) onStatus("error");
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
      attachSnapshot(user.uid);
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
        if (!userId) {
          await new Promise((resolve) => {
            saveResolver = resolve;
          });
        }
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
