import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { buildRecordMutations, stateToRecordSpecs } from "../src/services/record-codec.js";
import { __recordCloudTestUtils, createRecordCloudSync } from "../src/services/storage-cloud-records.js";

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function stateWithTransactions(...items) {
  const state = createInitialState();
  state.accounts = [{ id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 0 }];
  state.txs = items.map(([id, amount]) => ({
    id,
    type: "expense",
    amount,
    date: "2026-07-31",
    desc: id,
    cat: "其他支出",
    category: "其他支出",
    subcategory: "未分類",
    acc: "cash",
  }));
  return state;
}

function recordsFromState(state, revisionSource = new Map()) {
  const mutations = buildRecordMutations(state, revisionSource, {
    updatedBy: "remote-device",
    updatedAt: "server-time",
  });
  const next = new Map(revisionSource);
  mutations.forEach(({ key, envelope }) => next.set(key, envelope));
  return next;
}

function snapshotFromRecords(records, metadata = {}) {
  return {
    metadata: { hasPendingWrites: false, fromCache: false, ...metadata },
    forEach(callback) {
      records.forEach((value, id) => callback({ id, data: () => structuredClone(value) }));
    },
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createFirebaseFakes(
  initialUser,
  { meta = { status: "active" }, legacy = null, fencedLegacy = undefined, records = new Map(), authReadyUser = undefined } = {},
) {
  const auth = { currentUser: initialUser };
  let anonymousSignIns = 0;
  if (authReadyUser !== undefined) {
    auth.authStateReady = async () => {
      auth.currentUser = authReadyUser;
    };
  }
  const authCallbacks = new Set();
  const observers = [];
  const stored = new Map(records);
  let metaValue = meta;
  let legacyValue = legacy;
  let rejectNextCommit = null;
  let batchCommits = 0;
  let batchCommitAttempts = 0;
  let rejectCommitAttempt = null;
  let legacyReads = 0;
  let signOutCalls = 0;
  let terminateCalls = 0;
  let clearPersistenceCalls = 0;

  const pathOf = (...parts) => parts.filter((part) => part !== undefined).join("/");
  const isMeta = (ref) => ref.endsWith("/sync/finance_v7");
  const isLegacy = (ref) => ref.endsWith("/data/finance_v6");

  const documentSnapshot = (value) => ({
    exists: () => value !== null && value !== undefined,
    data: () => structuredClone(value),
  });

  const modules = {
    app: { initializeApp: () => ({}) },
    auth: {
      GoogleAuthProvider: class { setCustomParameters() {} },
      getAuth: () => auth,
      onAuthStateChanged: (_auth, callback) => {
        authCallbacks.add(callback);
        queueMicrotask(() => callback(auth.currentUser));
        return () => authCallbacks.delete(callback);
      },
      signInAnonymously: async () => { anonymousSignIns += 1; },
      signInWithCustomToken: async () => {},
      linkWithPopup: async () => {},
      signInWithPopup: async () => {},
      signOut: async () => { signOutCalls += 1; },
    },
    firestore: {
      persistentLocalCache: () => ({}),
      persistentMultipleTabManager: () => ({}),
      initializeFirestore: () => ({}),
      terminate: async () => { terminateCalls += 1; },
      clearIndexedDbPersistence: async () => { clearPersistenceCalls += 1; },
      doc: (_parent, ...parts) => pathOf(...parts),
      collection: (_db, ...parts) => pathOf(...parts),
      serverTimestamp: () => "server-time",
      getDoc: async (ref) => {
        if (isMeta(ref)) return documentSnapshot(metaValue);
        if (!isLegacy(ref)) return documentSnapshot(null);
        legacyReads += 1;
        return documentSnapshot(legacyReads > 1 && fencedLegacy !== undefined ? fencedLegacy : legacyValue);
      },
      getDocs: async () => snapshotFromRecords(stored),
      onSnapshot: (ref, options, next, error) => {
        const observer = { ref, options, next, error, active: true };
        observers.push(observer);
        return () => { observer.active = false; };
      },
      writeBatch: () => {
        const writes = [];
        return {
          set: (ref, value) => writes.push({ ref, value: structuredClone(value) }),
          commit: async () => {
            batchCommitAttempts += 1;
            if (rejectCommitAttempt?.attempt === batchCommitAttempts) {
              const error = rejectCommitAttempt.error;
              rejectCommitAttempt = null;
              throw error;
            }
            if (rejectNextCommit) {
              const error = rejectNextCommit;
              rejectNextCommit = null;
              throw error;
            }
            batchCommits += 1;
            writes.forEach(({ ref, value }) => {
              const id = ref.split("/").at(-1);
              stored.set(id, value);
            });
          },
        };
      },
      runTransaction: async (_db, callback) => callback({
        get: async () => documentSnapshot(metaValue),
        set: (_ref, value) => { metaValue = structuredClone(value); },
      }),
      setDoc: async (ref, value) => {
        if (isMeta(ref)) metaValue = structuredClone(value);
      },
    },
  };

  return {
    modules,
    observers,
    stored,
    getMeta: () => metaValue,
    getBatchCommits: () => batchCommits,
    getAnonymousSignIns: () => anonymousSignIns,
    getDeviceClearCalls: () => ({ signOutCalls, terminateCalls, clearPersistenceCalls }),
    rejectCommit: (error = new Error("permission-denied")) => { rejectNextCommit = error; },
    rejectCommitAfter: (successfulBatches, error = new Error("temporarily-unavailable")) => {
      rejectCommitAttempt = { attempt: batchCommitAttempts + successfulBatches + 1, error };
    },
    setRecords: (next) => {
      stored.clear();
      next.forEach((value, key) => stored.set(key, structuredClone(value)));
    },
    emitRecords: (index = observers.length - 1) => observers[index].next(snapshotFromRecords(stored)),
    emitAuth: async (user) => {
      auth.currentUser = user;
      [...authCallbacks].forEach((callback) => callback(user));
      await flush();
    },
  };
}

const oldConfig = globalThis.__firebase_config;
const oldAppId = globalThis.__app_id;
const oldStorage = globalThis.localStorage;
globalThis.__firebase_config = { projectId: "test", apiKey: "test" };
globalThis.__app_id = "test-app";
globalThis.localStorage = createMemoryStorage();

try {
  const conflictRemoteState = stateWithTransactions(["tx-1", 180], ["tx-remote", 400]);
  const conflictRemoteRecords = recordsFromState(conflictRemoteState);
  const conflictLocalState = stateWithTransactions(["tx-1", 175], ["tx-local", 300]);
  const conflictLocalSpecs = stateToRecordSpecs(conflictLocalState);
  const tx1Key = [...conflictLocalSpecs].find(([, record]) => record.kind === "transaction" && record.recordId === "tx-1")[0];
  const txLocalKey = [...conflictLocalSpecs].find(([, record]) => record.kind === "transaction" && record.recordId === "tx-local")[0];
  const conflictContext = {
    localState: conflictLocalState,
    remoteRecords: conflictRemoteRecords,
    conflictKeys: [tx1Key],
    mutationKeys: [tx1Key, txLocalKey],
  };
  const keepLocalResolution = __recordCloudTestUtils.buildConflictResolutionState(conflictContext, "local").state;
  assert.deepEqual(
    new Map(keepLocalResolution.txs.map((tx) => [tx.id, tx.amount])),
    new Map([["tx-1", 175], ["tx-local", 300], ["tx-remote", 400]]),
  );
  const keepCloudResolution = __recordCloudTestUtils.buildConflictResolutionState(conflictContext, "cloud").state;
  assert.deepEqual(
    new Map(keepCloudResolution.txs.map((tx) => [tx.id, tx.amount])),
    new Map([["tx-1", 180], ["tx-local", 300], ["tx-remote", 400]]),
  );

  const staleRecords = recordsFromState(stateWithTransactions(["tx-1", 100]));
  const newerRecords = recordsFromState(stateWithTransactions(["tx-1", 150]), staleRecords);
  const reconciledRecords = __recordCloudTestUtils.mergeRecordMapsByRevision(staleRecords, newerRecords);
  const reconciledTx = [...reconciledRecords.values()].find((record) => record.kind === "transaction");
  assert.equal(reconciledTx.payload.amount, 150);

  const userA = { uid: "user-a", isAnonymous: false, displayName: "A" };
  const initialState = stateWithTransactions(["tx-1", 100]);
  const initialRecords = recordsFromState(initialState);
  const restoredAuthFakes = createFirebaseFakes(null, {
    records: initialRecords,
    authReadyUser: userA,
  });
  const restoredUsers = [];
  const restoredSync = await createRecordCloudSync({
    getState: () => initialState,
    onStatus: () => {},
    onUserChange: (user) => restoredUsers.push(user),
    onRemoteState: () => {},
    onConflict: () => {},
    firebaseModules: restoredAuthFakes.modules,
  });
  await flush();
  assert.equal(restoredAuthFakes.getAnonymousSignIns(), 0);
  assert.equal(restoredUsers.at(-1)?.uid, "user-a");
  restoredSync.destroy();

  const equivalentUser = { uid: "equivalent-user", isAnonymous: false, displayName: "Equivalent" };
  const equivalentFakes = createFirebaseFakes(equivalentUser, { records: initialRecords });
  globalThis.localStorage.setItem(
    __recordCloudTestUtils.outboxKey(equivalentUser.uid),
    JSON.stringify({ pending: true, mode: "records" }),
  );
  const equivalentSync = await createRecordCloudSync({
    getState: () => initialState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: () => {},
    onConflict: () => {},
    firebaseModules: equivalentFakes.modules,
  });
  await flush();
  equivalentFakes.emitRecords(0);
  assert.equal(globalThis.localStorage.getItem(__recordCloudTestUtils.outboxKey(equivalentUser.uid)), null);
  equivalentSync.destroy();

  const clearUser = { uid: "clear-user", isAnonymous: false, displayName: "Clear" };
  const clearFakes = createFirebaseFakes(clearUser, { records: initialRecords });
  const clearSync = await createRecordCloudSync({
    getState: () => initialState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: () => {},
    onConflict: () => {},
    firebaseModules: clearFakes.modules,
  });
  await flush();
  assert.deepEqual(clearSync.getDeviceClearStatus(), {
    uid: "clear-user",
    signedIn: true,
    queueActive: false,
    hasPendingOutbox: false,
    conflict: false,
  });
  globalThis.localStorage.setItem(
    __recordCloudTestUtils.outboxKey("clear-user"),
    JSON.stringify({ pending: true }),
  );
  assert.equal(clearSync.getDeviceClearStatus().hasPendingOutbox, true);
  await assert.rejects(
    clearSync.clearDevicePersistence({ expectedUid: "another-user", allowDiscardUnsynced: true }),
    /device-clear-user-changed/,
  );
  await assert.rejects(
    clearSync.clearDevicePersistence({ expectedUid: "clear-user" }),
    /device-clear-unsynced-acknowledgement-required/,
  );
  assert.deepEqual(clearFakes.getDeviceClearCalls(), {
    signOutCalls: 0,
    terminateCalls: 0,
    clearPersistenceCalls: 0,
  });
  await clearSync.clearDevicePersistence({ expectedUid: "clear-user", allowDiscardUnsynced: true });
  assert.deepEqual(clearFakes.getDeviceClearCalls(), {
    signOutCalls: 1,
    terminateCalls: 1,
    clearPersistenceCalls: 1,
  });
  assert.equal(clearFakes.observers[0].active, false);

  const bulkBaseState = stateWithTransactions();
  const bulkFakes = createFirebaseFakes(userA, { records: recordsFromState(bulkBaseState) });
  let bulkState = structuredClone(bulkBaseState);
  const bulkConflicts = [];
  const bulkSync = await createRecordCloudSync({
    getState: () => bulkState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: () => {},
    onConflict: (conflict) => bulkConflicts.push(conflict),
    firebaseModules: bulkFakes.modules,
  });
  await flush();
  bulkFakes.emitRecords(0);
  bulkState = stateWithTransactions(...Array.from({ length: 450 }, (_, index) => [`bulk-${index}`, index + 1]));
  bulkFakes.rejectCommitAfter(1);
  await assert.rejects(bulkSync.save(), /temporarily-unavailable/);
  assert.equal(bulkFakes.getBatchCommits(), 1);
  assert.equal(bulkConflicts.length, 0);
  assert.equal(await bulkSync.save(), true);
  assert.equal(bulkFakes.getBatchCommits(), 2);
  assert.equal([...bulkFakes.stored.values()].filter((record) => record.kind === "transaction").length, 450);
  bulkSync.destroy();

  const fakes = createFirebaseFakes(userA, { records: initialRecords });
  const remoteEvents = [];
  const conflictEvents = [];
  let currentState = structuredClone(initialState);
  const sync = await createRecordCloudSync({
    getState: () => currentState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: (state, metadata) => remoteEvents.push({ state, metadata }),
    onConflict: (conflict) => conflictEvents.push(conflict),
    firebaseModules: fakes.modules,
  });
  await flush();
  assert.equal(fakes.observers[0].options.includeMetadataChanges, true);
  assert.equal(await sync.save(), false);
  fakes.emitRecords(0);
  assert.equal(remoteEvents.length, 1);
  assert.equal(remoteEvents[0].state.txs[0].amount, 100);

  currentState = stateWithTransactions(["tx-1", 150]);
  assert.equal(await sync.save(), true);
  const updatedTx = [...fakes.stored.values()].find((record) => record.kind === "transaction");
  assert.equal(updatedTx.revision, 2);
  assert.equal(updatedTx.payload.amount, 150);

  const remoteCombined = recordsFromState(
    stateWithTransactions(["tx-1", 150], ["tx-2", 200]),
    fakes.stored,
  );
  fakes.setRecords(remoteCombined);
  fakes.emitRecords(0);
  assert.equal(remoteEvents.at(-1).state.txs.length, 2);

  currentState = stateWithTransactions(["tx-1", 160], ["tx-2", 200]);
  fakes.rejectCommit(new Error("temporarily-unavailable"));
  await assert.rejects(sync.save(), /temporarily-unavailable/);
  const savedOutbox = JSON.parse(globalThis.localStorage.getItem(__recordCloudTestUtils.outboxKey("user-a")));
  assert.ok(savedOutbox.mutations.length >= 1);
  const remoteDuringRetry = recordsFromState(
    stateWithTransactions(["tx-1", 150], ["tx-2", 200], ["tx-3", 250]),
    remoteCombined,
  );
  const remoteCountBeforeDeferred = remoteEvents.length;
  fakes.setRecords(remoteDuringRetry);
  fakes.emitRecords(0);
  assert.equal(remoteEvents.length, remoteCountBeforeDeferred);
  await sync.save();
  assert.deepEqual(
    new Map(remoteEvents.at(-1).state.txs.map((tx) => [tx.id, tx.amount])),
    new Map([["tx-1", 160], ["tx-2", 200], ["tx-3", 250]]),
  );

  currentState = stateWithTransactions(["tx-1", 175], ["tx-2", 200], ["tx-3", 250]);
  const winningRemote = recordsFromState(
    stateWithTransactions(["tx-1", 180], ["tx-2", 200], ["tx-3", 250]),
    fakes.stored,
  );
  fakes.rejectCommit();
  fakes.setRecords(winningRemote);
  await sync.save();
  assert.equal(conflictEvents.length, 1);
  assert.equal(conflictEvents[0].keys.length, 1);
  const commitsAtConflict = fakes.getBatchCommits();
  await sync.resolveConflict("cancel");
  currentState = stateWithTransactions(["tx-1", 190], ["tx-2", 200], ["tx-3", 250]);
  await sync.save();
  assert.equal(fakes.getBatchCommits(), commitsAtConflict);
  await sync.resolveConflict("cloud");
  assert.equal(remoteEvents.at(-1).state.txs.find((tx) => tx.id === "tx-1").amount, 180);

  const userB = { uid: "user-b", isAnonymous: false, displayName: "B" };
  const commitsBeforeSwitch = fakes.getBatchCommits();
  const remoteEventsBeforeSwitch = remoteEvents.length;
  await fakes.emitAuth(userB);
  fakes.emitRecords(0);
  assert.equal(remoteEvents.length, remoteEventsBeforeSwitch);
  currentState = stateWithTransactions(["tx-b", 300]);
  await sync.save();
  assert.equal(fakes.getBatchCommits(), commitsBeforeSwitch);
  assert.equal(fakes.observers[0].active, false);
  fakes.emitRecords(1);
  await sync.save();
  assert.equal(fakes.getBatchCommits(), commitsBeforeSwitch + 1);
  sync.destroy();

  const migrationFakes = createFirebaseFakes(userA, {
    meta: null,
    legacy: initialState,
    records: new Map(),
  });
  const migrationEvents = [];
  let migrationState = structuredClone(initialState);
  const migrationSync = await createRecordCloudSync({
    getState: () => migrationState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: (state, metadata) => migrationEvents.push({ state, metadata }),
    onConflict: () => {},
    firebaseModules: migrationFakes.modules,
  });
  await flush();
  assert.equal(migrationEvents[0].metadata.migrationRequired, true);
  await migrationSync.save();
  assert.equal(migrationFakes.getMeta().status, "active");
  assert.ok(migrationFakes.stored.size > 0);
  migrationSync.destroy();

  const competingMigrationFakes = createFirebaseFakes(userA, {
    meta: {
      status: "preparing",
      migrationId: "migration-other-device",
      migrationSourceHash: __recordCloudTestUtils.sourceFingerprint(initialState),
      ownerDeviceId: "other-device",
    },
    legacy: initialState,
    records: new Map(),
  });
  const competingMigrationSync = await createRecordCloudSync({
    getState: () => initialState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: () => {},
    onConflict: () => {},
    firebaseModules: competingMigrationFakes.modules,
  });
  await flush();
  await assert.rejects(competingMigrationSync.save(), /migration-in-progress/);
  assert.equal(competingMigrationFakes.getMeta().status, "preparing");
  assert.equal(competingMigrationFakes.stored.size, 0);
  competingMigrationSync.destroy();

  const changedLegacyState = stateWithTransactions(["tx-1", 125]);
  const selectedLocalState = stateWithTransactions(["tx-local", 500]);
  const localMigrationFakes = createFirebaseFakes(userA, {
    meta: null,
    legacy: initialState,
    fencedLegacy: changedLegacyState,
    records: new Map(),
  });
  const localMigrationEvents = [];
  const localMigrationSync = await createRecordCloudSync({
    getState: () => selectedLocalState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: (state, metadata) => localMigrationEvents.push({ state, metadata }),
    onConflict: () => {},
    firebaseModules: localMigrationFakes.modules,
  });
  await flush();
  assert.equal(localMigrationEvents[0].metadata.migrationRequired, true);
  await assert.rejects(localMigrationSync.save(), /legacy-changed-before-cutover/);
  assert.equal(localMigrationFakes.getMeta().status, "preparing");
  assert.equal(localMigrationFakes.stored.size, 0);
  localMigrationSync.destroy();

  const deletedLegacyFakes = createFirebaseFakes(userA, {
    meta: null,
    legacy: initialState,
    fencedLegacy: null,
    records: new Map(),
  });
  const deletedLegacyEvents = [];
  const deletedLegacySync = await createRecordCloudSync({
    getState: () => selectedLocalState,
    onStatus: () => {},
    onUserChange: () => {},
    onRemoteState: (state, metadata) => deletedLegacyEvents.push({ state, metadata }),
    onConflict: () => {},
    firebaseModules: deletedLegacyFakes.modules,
  });
  await flush();
  assert.equal(deletedLegacyEvents[0].metadata.migrationRequired, true);
  await assert.rejects(deletedLegacySync.save(), /legacy-changed-before-cutover/);
  assert.equal(deletedLegacyFakes.getMeta().status, "preparing");
  assert.equal(deletedLegacyFakes.stored.size, 0);
  deletedLegacySync.destroy();

  console.log("Record cloud sync tests passed");
} finally {
  if (oldConfig === undefined) delete globalThis.__firebase_config;
  else globalThis.__firebase_config = oldConfig;
  if (oldAppId === undefined) delete globalThis.__app_id;
  else globalThis.__app_id = oldAppId;
  globalThis.localStorage = oldStorage;
}
