import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { buildRecordMutations, stateToRecordSpecs } from "../src/services/record-codec.js";
import {
  __recordCloudTestUtils,
  cloudOutboxStorageKey,
} from "../src/services/storage-cloud-records.js";

function stateWithTransaction(id, amount) {
  const state = createInitialState();
  state.accounts = [{ id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 0 }];
  state.txs = id ? [{
    id,
    type: "expense",
    amount,
    date: "2026-08-30",
    desc: id,
    cat: "其他支出",
    category: "其他支出",
    subcategory: "未分類",
    acc: "cash",
  }] : [];
  return state;
}

function recordsFromState(state, revisionSource = new Map()) {
  const mutations = buildRecordMutations(state, revisionSource, {
    updatedBy: "device-a",
    updatedAt: "server-time",
  });
  const records = new Map(revisionSource);
  mutations.forEach(({ key, envelope }) => records.set(key, envelope));
  return records;
}

const {
  buildConflictResolutionState,
  getDeviceId,
  mapsEquivalent,
  mergeRecordMapsByRevision,
  serializeOutboxMutations,
  sourceFingerprint,
} = __recordCloudTestUtils;

const initial = stateWithTransaction("tx-1", 100);
const initialRecords = recordsFromState(initial);
assert.equal(mapsEquivalent(initialRecords, new Map(initialRecords)), true);

const changed = stateWithTransaction("tx-1", 150);
const changedRecords = recordsFromState(changed, initialRecords);
assert.equal(mapsEquivalent(initialRecords, changedRecords), false);
assert.equal(
  [...mergeRecordMapsByRevision(initialRecords, changedRecords).values()]
    .find((record) => record.kind === "transaction").payload.amount,
  150,
);

const equalRevisionMismatch = new Map(initialRecords);
const [transactionKey, transactionRecord] = [...equalRevisionMismatch]
  .find(([, record]) => record.kind === "transaction");
equalRevisionMismatch.set(transactionKey, {
  ...transactionRecord,
  payload: { ...transactionRecord.payload, amount: 999 },
});
assert.throws(
  () => mergeRecordMapsByRevision(initialRecords, equalRevisionMismatch),
  new RegExp(`equal-revision-record-mismatch:${transactionKey}`),
);

const deletedLocally = stateWithTransaction("", 0);
const localSpecs = stateToRecordSpecs(deletedLocally);
const deletionContext = {
  localState: deletedLocally,
  remoteRecords: initialRecords,
  conflictKeys: [transactionKey],
  mutationKeys: [transactionKey],
};
const keepLocal = buildConflictResolutionState(deletionContext, "local");
assert.equal(keepLocal.state.txs.length, 0);
assert.deepEqual(keepLocal.selectedKeys, [transactionKey]);
const keepCloud = buildConflictResolutionState(deletionContext, "cloud");
assert.equal(keepCloud.state.txs[0].amount, 100);
assert.deepEqual(keepCloud.selectedKeys, []);
assert.equal(localSpecs.has(transactionKey), false);

const serialized = serializeOutboxMutations([{
  key: transactionKey,
  baseRevision: 1,
  envelope: {
    ...transactionRecord,
    revision: 2,
    updatedAt: "server-time",
    deleted: true,
    deletedAt: "server-time",
    payload: null,
  },
}]);
assert.equal(serialized[0].envelope.updatedAt, null);
assert.equal(serialized[0].envelope.deletedAt, null);
assert.equal(serialized[0].baseRevision, 1);

assert.equal(sourceFingerprint(initial), sourceFingerprint(structuredClone(initial)));
assert.notEqual(sourceFingerprint(initial), sourceFingerprint(changed));

const storageValues = new Map();
const storage = {
  getItem: (key) => storageValues.get(key) || null,
  setItem: (key, value) => storageValues.set(key, value),
};
const deviceId = getDeviceId(storage);
assert.equal(getDeviceId(storage), deviceId);
assert.notEqual(cloudOutboxStorageKey("user-a"), cloudOutboxStorageKey("user-b"));
assert.match(cloudOutboxStorageKey("user/a"), /user%2Fa$/);
assert.throws(() => cloudOutboxStorageKey(""), /missing-cloud-outbox-user-id/);

console.log("Record sync protocol characterization tests passed");
