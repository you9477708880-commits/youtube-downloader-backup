import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/config/constants.js";
import { getFinanceRuntime, runtimeDatabaseName } from "../src/config/runtime.js";
import { createInitialState } from "../src/state/initial-state.js";
import { createRecordCloudSync } from "../src/services/storage-cloud-records.js";
import {
  LOCAL_STORAGE_SCOPE,
  __localStorageTestUtils,
  loadLocalState,
  migrateLegacyLocalState,
  saveLocalState,
} from "../src/services/storage-local.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => new Map(values),
  };
}

function stateWithMarker(marker) {
  const state = createInitialState();
  state.txs = [{
    id: `tx-${marker}`, type: "expense", amount: 100, date: "2026-08-23", desc: marker,
    category: "其他支出", subcategory: "未分類", cat: "其他支出", acc: "a1",
  }];
  return state;
}

test("acceptance runtime isolates local data, legacy data, recovery storage, and cloud initialization", async () => {
  const originalRuntime = globalThis.__finance_runtime;
  const originalFirebaseConfig = globalThis.__firebase_config;
  const storage = createMemoryStorage();
  const base = createInitialState();

  try {
    globalThis.__finance_runtime = { mode: "production", cloudEnabled: true, pwaEnabled: true };
    const productionKey = __localStorageTestUtils.snapshotKey(LOCAL_STORAGE_SCOPE);
    saveLocalState(stateWithMarker("production"), LOCAL_STORAGE_SCOPE, storage);

    globalThis.__finance_runtime = { mode: "acceptance", cloudEnabled: false, pwaEnabled: false };
    const acceptanceKey = __localStorageTestUtils.snapshotKey(LOCAL_STORAGE_SCOPE);
    assert.equal(getFinanceRuntime().cloudEnabled, false);
    assert.notEqual(acceptanceKey, productionKey);
    assert.match(acceptanceKey, /^fin_v7:acceptance:state:/);
    assert.equal(loadLocalState(base, LOCAL_STORAGE_SCOPE, storage).txs.length, 0);

    saveLocalState(stateWithMarker("acceptance"), LOCAL_STORAGE_SCOPE, storage);
    assert.equal(loadLocalState(base, LOCAL_STORAGE_SCOPE, storage).txs[0].desc, "acceptance");
    assert.equal(JSON.parse(storage.getItem(productionKey)).txs[0].desc, "production");

    const legacyOnlyStorage = createMemoryStorage();
    legacyOnlyStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(stateWithMarker("legacy").txs));
    assert.equal(loadLocalState(base, LOCAL_STORAGE_SCOPE, legacyOnlyStorage).txs.length, 0);
    assert.deepEqual(migrateLegacyLocalState(base, legacyOnlyStorage), {
      migrated: false,
      reason: "acceptance-runtime-isolated",
    });
    assert.equal(legacyOnlyStorage.dump().size, 1);
    assert.equal(runtimeDatabaseName("finance-web-recovery-v1"), "finance-web-recovery-v1-acceptance");

    globalThis.__firebase_config = JSON.stringify({ projectId: "financial-computer", apiKey: "should-not-be-used" });
    const cloud = await createRecordCloudSync({
      getState: () => base,
      firebaseModules: {
        get app() { throw new Error("acceptance-runtime-loaded-firebase"); },
        get auth() { throw new Error("acceptance-runtime-loaded-firebase"); },
        get firestore() { throw new Error("acceptance-runtime-loaded-firebase"); },
      },
    });
    assert.equal(cloud.enabled, false);
    assert.match(cloud.error, /Cloud disabled by runtime/);
  } finally {
    globalThis.__finance_runtime = originalRuntime;
    globalThis.__firebase_config = originalFirebaseConfig;
  }
});
