import assert from "node:assert/strict";
import { STORAGE_KEYS } from "../src/config/constants.js";
import { createInitialState } from "../src/state/initial-state.js";
import {
  LOCAL_STORAGE_SCOPE,
  __localStorageTestUtils,
  hasLocalState,
  loadLocalState,
  localScopeStorageKeys,
  migrateLegacyLocalState,
  saveRollbackSnapshot,
  saveLocalState,
  userStorageScope,
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
    id: `tx-${marker}`,
    type: "expense",
    amount: 100,
    date: "2026-07-31",
    desc: marker,
    category: "其他支出",
    subcategory: "未分類",
    cat: "其他支出",
    acc: "a1",
  }];
  return state;
}

const storage = createMemoryStorage();
const base = createInitialState();
const scopeA = userStorageScope("user-a");
const scopeB = userStorageScope("user-b");

saveLocalState(stateWithMarker("local"), LOCAL_STORAGE_SCOPE, storage);
saveLocalState(stateWithMarker("A"), scopeA, storage);
saveLocalState(stateWithMarker("B"), scopeB, storage);

assert.equal(loadLocalState(base, LOCAL_STORAGE_SCOPE, storage).txs[0].desc, "local");
assert.equal(loadLocalState(base, scopeA, storage).txs[0].desc, "A");
assert.equal(loadLocalState(base, scopeB, storage).txs[0].desc, "B");
assert.notEqual(
  __localStorageTestUtils.snapshotKey(scopeA),
  __localStorageTestUtils.snapshotKey(scopeB),
);
assert.deepEqual(localScopeStorageKeys(scopeA), {
  snapshot: __localStorageTestUtils.snapshotKey(scopeA),
  rollback: __localStorageTestUtils.rollbackKey(scopeA),
});

const corruptStorage = createMemoryStorage();
corruptStorage.setItem(__localStorageTestUtils.snapshotKey(scopeA), "{broken");
saveLocalState(stateWithMarker("safe-B"), scopeB, corruptStorage);
const originalWarn = console.warn;
console.warn = () => {};
assert.deepEqual(loadLocalState(base, scopeA, corruptStorage).txs, []);
console.warn = originalWarn;
assert.equal(loadLocalState(base, scopeB, corruptStorage).txs[0].desc, "safe-B");

const corruptLocalWithLegacy = createMemoryStorage();
corruptLocalWithLegacy.setItem(__localStorageTestUtils.snapshotKey(LOCAL_STORAGE_SCOPE), "{broken");
corruptLocalWithLegacy.setItem(STORAGE_KEYS.txs, JSON.stringify(stateWithMarker("legacy-recovery").txs));
console.warn = () => {};
assert.equal(loadLocalState(base, LOCAL_STORAGE_SCOPE, corruptLocalWithLegacy).txs[0].desc, "legacy-recovery");
console.warn = originalWarn;

const legacyStorage = createMemoryStorage();
legacyStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(stateWithMarker("legacy").txs));
const migration = migrateLegacyLocalState(base, legacyStorage);
assert.equal(migration.migrated, true);
assert.equal(loadLocalState(base, LOCAL_STORAGE_SCOPE, legacyStorage).txs[0].desc, "legacy");
assert.equal(hasLocalState(scopeA, legacyStorage), false);
assert.equal(legacyStorage.getItem(STORAGE_KEYS.txs) !== null, true);
assert.equal(migrateLegacyLocalState(base, legacyStorage).reason, "already-checked");

saveRollbackSnapshot(stateWithMarker("rollback"), scopeA, "before-cloud", storage);
const rollback = JSON.parse(storage.getItem(__localStorageTestUtils.rollbackKey(scopeA)));
assert.equal(rollback.label, "before-cloud");
assert.equal(rollback.state.txs[0].desc, "rollback");

const failedStorage = createMemoryStorage();
failedStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(stateWithMarker("retry").txs));
const originalSetItem = failedStorage.setItem;
let shouldFail = true;
failedStorage.setItem = (key, value) => {
  if (shouldFail && key.startsWith("fin_v7:state:")) {
    shouldFail = false;
    throw new Error("quota");
  }
  originalSetItem(key, value);
};
assert.throws(() => migrateLegacyLocalState(base, failedStorage), /quota/);
assert.equal(failedStorage.getItem(__localStorageTestUtils.legacyMigrationKey), null);
assert.equal(migrateLegacyLocalState(base, failedStorage).migrated, true);

console.log("Scoped local storage tests passed");
