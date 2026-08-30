import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECORD_BATCH_LIMIT,
  createFirestoreRecordAdapter,
} from "../src/services/firestore-record-adapter.js";
import { recordKey } from "../src/services/record-codec.js";

function snapshotFrom(records, metadata = {}) {
  return {
    metadata,
    forEach(callback) {
      records.forEach((record, id) => callback({ id, data: () => structuredClone(record) }));
    },
  };
}

function createHarness() {
  const calls = [];
  let listener = null;
  const firestoreMod = {
    doc: (_parent, ...parts) => parts.join("/"),
    collection: (_parent, ...parts) => parts.join("/"),
    serverTimestamp: () => "server-time",
    writeBatch: () => {
      const writes = [];
      return {
        set: (ref, envelope) => writes.push({ ref, envelope }),
        commit: async () => calls.push({ type: "commit", writes }),
      };
    },
    getDoc: async (ref) => ({ ref }),
    getDocs: async () => snapshotFrom(new Map()),
    onSnapshot: (_ref, options, next, error) => {
      listener = { options, next, error };
      return () => calls.push({ type: "unsubscribe" });
    },
    terminate: async () => calls.push({ type: "terminate" }),
    clearIndexedDbPersistence: async () => calls.push({ type: "clear-persistence" }),
  };
  const adapter = createFirestoreRecordAdapter({ firestoreMod, db: {}, appId: "app", deviceId: "device" });
  return { adapter, calls, getListener: () => listener };
}

test("adapter owns v7 paths and server timestamp creation", () => {
  const { adapter } = createHarness();
  assert.deepEqual(adapter.refsFor("user"), {
    legacy: "artifacts/app/users/user/data/finance_v6",
    meta: "artifacts/app/users/user/sync/finance_v7",
    records: "artifacts/app/users/user/sync/finance_v7/records",
  });
  assert.equal(adapter.serverTimestamp(), "server-time");
});

test("adapter maps SDK snapshots before crossing the listener boundary", () => {
  const { adapter, calls, getListener } = createHarness();
  const received = [];
  const unsubscribe = adapter.listenRecords(
    adapter.refsFor("user"),
    (records, metadata) => received.push({ records, metadata }),
    () => {},
  );
  const record = {
    kind: "settings",
    recordId: "main",
    revision: 1,
    payload: { budgetCap: 1 },
    deleted: false,
  };
  const key = recordKey(record.kind, record.recordId);
  getListener().next(snapshotFrom(new Map([[key, record]]), { fromCache: true }));
  assert.equal(getListener().options.includeMetadataChanges, true);
  assert.deepEqual(received[0].records.get(key), record);
  assert.deepEqual(received[0].metadata, { fromCache: true });
  unsubscribe();
  assert.equal(calls.at(-1).type, "unsubscribe");
});

test("adapter routes invalid SDK snapshots to the listener error boundary", () => {
  const { adapter, getListener } = createHarness();
  const errors = [];
  adapter.listenRecords(adapter.refsFor("user"), () => {}, (error) => errors.push(error));
  getListener().next(snapshotFrom(new Map([["bad-key", {
    kind: "settings",
    recordId: "main",
    revision: 1,
    payload: {},
    deleted: false,
  }]])));
  assert.equal(errors.length, 1);
});

test("adapter splits mutation groups into ordered batches of at most 400", async () => {
  const { adapter, calls } = createHarness();
  const refs = adapter.refsFor("user");
  const mutations = Array.from({ length: RECORD_BATCH_LIMIT + 1 }, (_, index) => ({
    key: `record-${index}`,
    envelope: { revision: 1, payload: { index } },
  }));
  await adapter.writeMutationGroup(refs, mutations);
  const commits = calls.filter((call) => call.type === "commit");
  assert.deepEqual(commits.map((call) => call.writes.length), [RECORD_BATCH_LIMIT, 1]);
  assert.match(commits[0].writes[0].ref, /record-0$/);
  assert.match(commits[1].writes[0].ref, /record-400$/);
});

test("adapter terminates Firestore before clearing browser persistence", async () => {
  const { adapter, calls } = createHarness();
  await adapter.clearPersistence();
  assert.deepEqual(calls.map((call) => call.type), ["terminate", "clear-persistence"]);
});
