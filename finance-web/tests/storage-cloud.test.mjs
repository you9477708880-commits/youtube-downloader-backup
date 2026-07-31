import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createCloudSync } from "../src/services/storage-cloud.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function stateWithMarker(marker) {
  const state = createInitialState();
  state.txs = [
    {
      id: `tx-${marker}`,
      type: "expense",
      amount: 100,
      desc: marker,
      date: "2026-07-31",
      cat: "其他支出",
      category: "其他支出",
      subcategory: "未分類",
      acc: "a1",
    },
  ];
  return state;
}

function createFirebaseFakes(initialUser) {
  const auth = { currentUser: initialUser };
  const authCallbacks = new Set();
  const observers = [];
  const writes = [];
  const writeGates = [];

  const emitAuth = async (user) => {
    auth.currentUser = user;
    [...authCallbacks].forEach((callback) => callback(user));
    await flushMicrotasks();
  };

  const modules = {
    app: {
      initializeApp: () => ({}),
    },
    auth: {
      GoogleAuthProvider: class {
        setCustomParameters() {}
      },
      getAuth: () => auth,
      onAuthStateChanged: (_auth, callback) => {
        authCallbacks.add(callback);
        queueMicrotask(() => callback(auth.currentUser));
        return () => authCallbacks.delete(callback);
      },
      signInAnonymously: async () => {},
      signInWithCustomToken: async () => {},
      linkWithPopup: async () => {},
      signInWithPopup: async () => {},
      signOut: async () => {},
    },
    firestore: {
      persistentLocalCache: () => ({}),
      persistentMultipleTabManager: () => ({}),
      initializeFirestore: () => ({}),
      doc: (_db, ...parts) => parts.join("/"),
      setDoc: (docRef, state) => {
        const gate = deferred();
        writes.push({ docRef, state });
        writeGates.push(gate);
        return gate.promise;
      },
      onSnapshot: (docRef, options, next, error) => {
        const observer = { docRef, options, next, error, active: true };
        observers.push(observer);
        return () => {
          observer.active = false;
        };
      },
    },
  };

  return { auth, emitAuth, modules, observers, writes, writeGates };
}

function emitSnapshot(observer, state, { exists = true, hasPendingWrites = false, fromCache = false } = {}) {
  observer.next({
    exists: () => exists,
    data: () => state,
    metadata: { hasPendingWrites, fromCache },
  });
}

const previousConfig = globalThis.__firebase_config;
const previousAppId = globalThis.__app_id;
globalThis.__firebase_config = { projectId: "test-project", apiKey: "test-key" };
globalThis.__app_id = "test-app";

try {
  const userA = { uid: "user-a", isAnonymous: false, displayName: "A", email: "a@example.com" };
  const userB = { uid: "user-b", isAnonymous: false, displayName: "B", email: "b@example.com" };
  const fakes = createFirebaseFakes(userA);
  const statuses = [];
  const remoteStates = [];
  let currentState = stateWithMarker("A");

  const cloudSync = await createCloudSync({
    getState: () => currentState,
    onStatus: (status) => statuses.push(status),
    onRemoteState: (state) => remoteStates.push(state),
    onUserChange: () => {},
    firebaseModules: fakes.modules,
  });
  await flushMicrotasks();
  assert.equal(fakes.observers[0].options.includeMetadataChanges, true);

  await cloudSync.save();
  await flushMicrotasks();
  assert.equal(fakes.writes.length, 0);
  emitSnapshot(fakes.observers[0], currentState);

  const saveA = cloudSync.save();
  await flushMicrotasks();
  assert.equal(fakes.writes.length, 1);
  assert.equal(fakes.writes[0].state.txs[0].desc, "A");

  currentState = stateWithMarker("B");
  const saveB = cloudSync.save();
  currentState = stateWithMarker("C");
  const saveC = cloudSync.save();

  fakes.writeGates[0].resolve();
  await flushMicrotasks();
  assert.equal(fakes.writes.length, 2);
  assert.equal(fakes.writes[1].state.txs[0].desc, "C");
  assert.ok(fakes.writes.every((write) => write.docRef.includes("/users/user-a/")));

  fakes.writeGates[1].resolve();
  await Promise.all([saveA, saveB, saveC]);
  assert.equal(statuses.at(-1), "syncing");

  emitSnapshot(fakes.observers[0], currentState);
  assert.equal(statuses.at(-1), "online");
  assert.equal(remoteStates.length, 0);

  currentState = stateWithMarker("D");
  const saveD = cloudSync.save();
  await flushMicrotasks();
  emitSnapshot(fakes.observers[0], currentState, { hasPendingWrites: true, fromCache: true });
  assert.equal(remoteStates.length, 0);
  const remoteDuringWrite = stateWithMarker("remote-before-D");
  emitSnapshot(fakes.observers[0], remoteDuringWrite);
  assert.equal(remoteStates.length, 0);

  fakes.writeGates[2].resolve();
  await saveD;
  emitSnapshot(fakes.observers[0], currentState);
  assert.equal(remoteStates.length, 0);

  currentState = stateWithMarker("E");
  const saveE = cloudSync.save();
  await flushMicrotasks();
  emitSnapshot(fakes.observers[0], currentState);
  const remoteAfterEcho = stateWithMarker("remote-after-E");
  emitSnapshot(fakes.observers[0], remoteAfterEcho);
  assert.equal(remoteStates.length, 0);
  fakes.writeGates[3].resolve();
  await saveE;
  assert.equal(remoteStates.length, 1);
  assert.equal(remoteStates[0].txs[0].desc, "remote-after-E");

  currentState = stateWithMarker("A-before-switch");
  const saveBeforeSwitch = cloudSync.save();
  await flushMicrotasks();
  const oldObserver = fakes.observers[0];
  const writesBeforeUserBReady = fakes.writes.length;

  await fakes.emitAuth(userB);
  currentState = stateWithMarker("B-after-switch");
  await cloudSync.save();
  await flushMicrotasks();
  assert.equal(fakes.writes.length, writesBeforeUserBReady);

  emitSnapshot(fakes.observers[1], currentState);
  const saveForB = cloudSync.save();
  await flushMicrotasks();
  assert.ok(fakes.writes.at(-1).docRef.includes("/users/user-b/"));
  assert.equal(fakes.writes.at(-1).state.txs[0].desc, "B-after-switch");

  fakes.writeGates[4].resolve();
  await saveBeforeSwitch;
  emitSnapshot(oldObserver, stateWithMarker("late-user-a"));
  assert.equal(remoteStates.length, 1);

  fakes.writeGates[5].resolve();
  await saveForB;
  emitSnapshot(fakes.observers[1], currentState);
  assert.equal(statuses.at(-1), "online");

  cloudSync.destroy();
  console.log("Cloud storage integration tests passed");
} finally {
  if (previousConfig === undefined) delete globalThis.__firebase_config;
  else globalThis.__firebase_config = previousConfig;
  if (previousAppId === undefined) delete globalThis.__app_id;
  else globalThis.__app_id = previousAppId;
}
