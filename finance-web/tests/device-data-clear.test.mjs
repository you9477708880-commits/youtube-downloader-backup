import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/config/constants.js";
import { createDeviceDataClearService } from "../src/services/device-data-clear.js";
import { cloudOutboxStorageKey } from "../src/services/storage-cloud-records.js";
import { localScopeStorageKeys } from "../src/services/storage-local.js";

function createMemoryStorage(entries = [], { failRemoveKey = "", log = [] } = {}) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem(key) {
      log.push(`remove:${key}`);
      if (key === failRemoveKey) throw new Error("storage-remove-failed");
      values.delete(key);
    },
    has: (key) => values.has(key),
  };
}

function createRecoveryFake(entries = {}, { fail = false, log = [] } = {}) {
  const counts = new Map(Object.entries(entries));
  return {
    async count(scope) { return Number(counts.get(scope) || 0); },
    async clear(scope) {
      log.push(`recovery:${scope}`);
      if (fail) throw new Error("recovery-clear-failed");
      const count = Number(counts.get(scope) || 0);
      counts.delete(scope);
      return count;
    },
    countFor: (scope) => Number(counts.get(scope) || 0),
  };
}

function createCloudFake({ uid, status = {}, fail = null, log = [] } = {}) {
  let calls = 0;
  return {
    getDeviceClearStatus: () => ({
      uid,
      signedIn: true,
      queueActive: false,
      hasPendingOutbox: false,
      conflict: false,
      ...status,
    }),
    async clearDevicePersistence(options) {
      calls += 1;
      log.push("firestore-persistence");
      assert.equal(options.expectedUid, uid);
      if (fail) throw fail;
      return { cleared: true, uid };
    },
    calls: () => calls,
  };
}

function productionKeys(uid) {
  return {
    current: localScopeStorageKeys(`uid:${uid}`),
    outbox: cloudOutboxStorageKey(uid),
    other: localScopeStorageKeys("uid:other-user"),
    otherOutbox: cloudOutboxStorageKey("other-user"),
    local: localScopeStorageKeys("local"),
  };
}

test("current UID clear runs cloud and recovery first, removes snapshot last, and preserves unrelated namespaces", async () => {
  const uid = "current-user";
  const keys = productionKeys(uid);
  const operationLog = [];
  const storage = createMemoryStorage([
    [keys.current.snapshot, "current-state"],
    [keys.current.rollback, "current-rollback"],
    [keys.outbox, "null"],
    [keys.other.snapshot, "other-state"],
    [keys.other.rollback, "other-rollback"],
    [keys.otherOutbox, "other-outbox"],
    [keys.local.snapshot, "local-state"],
    ["fin_v7:migration:legacy-v6", "migrated-to-local"],
    ["fin_v7:sync:device-id", "device-1"],
    [STORAGE_KEYS.txs, "legacy-txs"],
  ], { log: operationLog });
  const recoveryStore = createRecoveryFake({ [`uid:${uid}`]: 2, "uid:other-user": 1 }, { log: operationLog });
  const cloudSync = createCloudFake({ uid, log: operationLog });
  const service = createDeviceDataClearService({ storage, recoveryStore, cloudSync });

  const result = await service.clear(
    { scope: `uid:${uid}`, uid },
    { acknowledgeUnsynced: true },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.completed, ["firestore-persistence", "recovery", "rollback", "outbox", "snapshot"]);
  assert.deepEqual(operationLog, [
    "firestore-persistence",
    `recovery:uid:${uid}`,
    `remove:${keys.current.rollback}`,
    `remove:${keys.outbox}`,
    `remove:${keys.current.snapshot}`,
  ]);
  assert.equal(storage.has(keys.current.snapshot), false);
  assert.equal(storage.has(keys.current.rollback), false);
  assert.equal(storage.has(keys.outbox), false);
  assert.equal(storage.has(keys.other.snapshot), true);
  assert.equal(storage.has(keys.other.rollback), true);
  assert.equal(storage.has(keys.otherOutbox), true);
  assert.equal(storage.has(keys.local.snapshot), true);
  assert.equal(storage.has("fin_v7:migration:legacy-v6"), true);
  assert.equal(storage.has("fin_v7:sync:device-id"), true);
  assert.equal(storage.has(STORAGE_KEYS.txs), true);
  assert.equal(recoveryStore.countFor(`uid:${uid}`), 0);
  assert.equal(recoveryStore.countFor("uid:other-user"), 1);
});

test("pending outbox and active sync require explicit acknowledgement before any clearing", async () => {
  const uid = "pending-user";
  const keys = productionKeys(uid);
  const log = [];
  const storage = createMemoryStorage([
    [keys.current.snapshot, "state"],
    [keys.outbox, JSON.stringify({ pending: true })],
  ], { log });
  const recoveryStore = createRecoveryFake({ [`uid:${uid}`]: 1 }, { log });
  const cloudSync = createCloudFake({ uid, status: { queueActive: true }, log });
  const service = createDeviceDataClearService({ storage, recoveryStore, cloudSync });

  const blocked = await service.clear({ scope: `uid:${uid}`, uid });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "unsynced-acknowledgement-required");
  assert.deepEqual(log, []);
  assert.equal(storage.has(keys.current.snapshot), true);
  assert.equal(recoveryStore.countFor(`uid:${uid}`), 1);

  const accepted = await service.clear(
    { scope: `uid:${uid}`, uid },
    { acknowledgeUnsynced: true },
  );
  assert.equal(accepted.ok, true);
});

test("Firestore persistence failure is fail-closed for recovery and local storage", async () => {
  const uid = "blocked-user";
  const keys = productionKeys(uid);
  const log = [];
  const storage = createMemoryStorage([
    [keys.current.snapshot, "state"],
    [keys.current.rollback, "rollback"],
  ], { log });
  const recoveryStore = createRecoveryFake({ [`uid:${uid}`]: 1 }, { log });
  const error = Object.assign(new Error("other tabs are open"), { code: "failed-precondition" });
  const cloudSync = createCloudFake({ uid, fail: error, log });
  const service = createDeviceDataClearService({ storage, recoveryStore, cloudSync });

  const result = await service.clear({ scope: `uid:${uid}`, uid });
  assert.equal(result.ok, false);
  assert.equal(result.code, "firestore-persistence-clear-failed");
  assert.equal(result.requiresReload, true);
  assert.deepEqual(log, ["firestore-persistence"]);
  assert.equal(storage.has(keys.current.snapshot), true);
  assert.equal(storage.has(keys.current.rollback), true);
  assert.equal(recoveryStore.countFor(`uid:${uid}`), 1);
});

test("recovery failure after Firestore clearing preserves all local keys", async () => {
  const uid = "recovery-failure";
  const keys = productionKeys(uid);
  const log = [];
  const storage = createMemoryStorage([
    [keys.current.snapshot, "state"],
    [keys.current.rollback, "rollback"],
  ], { log });
  const recoveryStore = createRecoveryFake({ [`uid:${uid}`]: 1 }, { fail: true, log });
  const service = createDeviceDataClearService({
    storage,
    recoveryStore,
    cloudSync: createCloudFake({ uid, log }),
  });

  const result = await service.clear({ scope: `uid:${uid}`, uid });
  assert.equal(result.ok, false);
  assert.equal(result.code, "recovery-clear-failed");
  assert.deepEqual(result.completed, ["firestore-persistence"]);
  assert.equal(storage.has(keys.current.snapshot), true);
  assert.equal(storage.has(keys.current.rollback), true);
});

test("local storage failure keeps the core snapshot because it is removed last", async () => {
  const uid = "storage-failure";
  const keys = productionKeys(uid);
  const log = [];
  const storage = createMemoryStorage([
    [keys.current.snapshot, "state"],
    [keys.current.rollback, "rollback"],
    [keys.outbox, "outbox"],
  ], { failRemoveKey: keys.outbox, log });
  const service = createDeviceDataClearService({
    storage,
    recoveryStore: createRecoveryFake({ [`uid:${uid}`]: 1 }, { log }),
    cloudSync: createCloudFake({ uid, log }),
  });

  const result = await service.clear(
    { scope: `uid:${uid}`, uid },
    { acknowledgeUnsynced: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "local-storage-clear-failed");
  assert.deepEqual(result.completed, ["firestore-persistence", "recovery", "rollback"]);
  assert.equal(storage.has(keys.current.snapshot), true);
  assert.equal(storage.has(keys.current.rollback), false);
  assert.equal(storage.has(keys.outbox), true);
});

test("signed-out local clear never calls the cloud boundary", async () => {
  const keys = localScopeStorageKeys("local");
  const storage = createMemoryStorage([
    [keys.snapshot, "local-state"],
    [keys.rollback, "local-rollback"],
  ]);
  let cloudCalls = 0;
  const service = createDeviceDataClearService({
    storage,
    recoveryStore: createRecoveryFake({ local: 1 }),
    cloudSync: { clearDevicePersistence: async () => { cloudCalls += 1; } },
  });

  const result = await service.clear({ scope: "local" });
  assert.equal(result.ok, true);
  assert.equal(cloudCalls, 0);
  assert.equal(storage.has(keys.snapshot), false);
  assert.equal(storage.has(keys.rollback), false);
});

test("acceptance runtime clears only the acceptance namespace", async () => {
  const previousRuntime = globalThis.__finance_runtime;
  try {
    globalThis.__finance_runtime = { mode: "production" };
    const production = localScopeStorageKeys("local");
    globalThis.__finance_runtime = { mode: "acceptance", cloudEnabled: false, pwaEnabled: false };
    const acceptance = localScopeStorageKeys("local");
    const storage = createMemoryStorage([
      [production.snapshot, "production"],
      [acceptance.snapshot, "acceptance"],
      [acceptance.rollback, "acceptance-rollback"],
    ]);
    const service = createDeviceDataClearService({
      storage,
      recoveryStore: createRecoveryFake({ local: 1 }),
      cloudSync: { clearDevicePersistence: async () => { throw new Error("must-not-run"); } },
    });

    const result = await service.clear({ scope: "local" });
    assert.equal(result.ok, true);
    assert.equal(storage.has(acceptance.snapshot), false);
    assert.equal(storage.has(acceptance.rollback), false);
    assert.equal(storage.has(production.snapshot), true);
  } finally {
    globalThis.__finance_runtime = previousRuntime;
  }
});

test("invalid or mismatched scope and UID fail before inspection", async () => {
  const service = createDeviceDataClearService({
    storage: createMemoryStorage(),
    recoveryStore: createRecoveryFake(),
  });
  await assert.rejects(service.inspect({ scope: "uid:user-a", uid: "user-b" }), /invalid-device-clear-target/);
  await assert.rejects(service.inspect({ scope: "uid:", uid: "" }), /invalid-device-clear-target/);
});
