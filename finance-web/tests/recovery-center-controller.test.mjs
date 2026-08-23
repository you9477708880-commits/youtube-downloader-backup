import assert from "node:assert/strict";
import { test } from "node:test";
import { createRecoveryCenterController } from "../src/app/controllers/recovery-center-controller.js";
import { createInitialState } from "../src/state/initial-state.js";
import { createConflictRecoveryStore } from "../src/services/conflict-recovery.js";

function classList() {
  const values = new Set(["d-none"]);
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    toggle: (item, force) => force ? values.add(item) : values.delete(item),
    contains: (item) => values.has(item),
  };
}

function memoryDriver() {
  const records = new Map();
  return {
    async put(entry) { records.set(entry.id, structuredClone(entry)); },
    async get(id) { return structuredClone(records.get(id) || null); },
    async getAll() { return structuredClone([...records.values()]); },
    async delete(id) { records.delete(id); },
  };
}

function financeState(amount) {
  const state = createInitialState();
  state.txs = [{ id: "tx-1", type: "expense", amount, desc: "午餐", date: "2026-08-23", cat: "餐飲", category: "餐飲", subcategory: "午餐", acc: state.accounts[0].id }];
  return state;
}

test("recovery center renders, restores selected records, exports manually, and deletes after confirmation", async () => {
  let current = financeState(500);
  const repository = createConflictRecoveryStore({ driver: memoryDriver(), createId: () => "entry-1" });
  const entry = await repository.save({ scope: "uid:user-a", state: financeState(100), winnerState: current, choice: "cloud", conflictType: "record" });
  const checked = [{ dataset: { recoveryEntry: entry.id, recoveryKey: entry.recordKeys[0] } }];
  const elements = {
    modal: { classList: classList() },
    summary: { textContent: "" },
    list: { innerHTML: "", querySelectorAll: () => checked },
    empty: { classList: classList() },
    close: { focus() {} },
  };
  const calls = { commits: 0, exports: [], toasts: [] };
  const controller = createRecoveryCenterController({
    elements,
    store: { getState: () => current },
    recoveryStore: repository,
    getScope: () => "uid:user-a",
    commitState: (mutator, { updateUi }) => {
      calls.commits += 1;
      current = mutator(structuredClone(current));
      updateUi(current);
    },
    refreshWholeStateUi: () => {},
    exportBackupFile: (...args) => calls.exports.push(args),
    toast: { show: (...args) => calls.toasts.push(args) },
    escapeHTML: (value) => String(value),
    confirmRestore: () => true,
    confirmDelete: () => true,
  });

  assert.equal(await controller.open(), true);
  assert.equal(elements.modal.classList.contains("d-none"), false);
  assert.match(elements.list.innerHTML, /當時保留雲端/);
  assert.equal(await controller.restore(entry.id), true);
  assert.equal(current.txs[0].amount, 100);
  assert.equal(calls.commits, 1);

  assert.equal(await controller.exportEntry(entry.id), true);
  assert.equal(calls.exports[0][0].txs[0].amount, 100);
  assert.match(calls.exports[0][1], /^finance-recovery-/);

  assert.equal(await controller.remove(entry.id), true);
  assert.equal((await repository.list("uid:user-a")).length, 0);
});

test("cancelled restore and wrong UID do not mutate current state", async () => {
  let current = financeState(500);
  const repository = createConflictRecoveryStore({ driver: memoryDriver(), createId: () => "entry-a" });
  const entry = await repository.save({ scope: "uid:user-a", state: financeState(100), winnerState: current });
  const elements = {
    modal: { classList: classList() },
    summary: { textContent: "" },
    list: { innerHTML: "", querySelectorAll: () => [{ dataset: { recoveryEntry: entry.id, recoveryKey: entry.recordKeys[0] } }] },
    empty: { classList: classList() },
    close: { focus() {} },
  };
  const controller = createRecoveryCenterController({
    elements,
    store: { getState: () => current },
    recoveryStore: repository,
    getScope: () => "uid:user-b",
    commitState: () => { throw new Error("must-not-commit"); },
    refreshWholeStateUi: () => {},
    exportBackupFile: () => {},
    toast: { show() {} },
    escapeHTML: (value) => String(value),
    confirmRestore: () => false,
    confirmDelete: () => false,
    onWarn: () => {},
  });

  assert.equal(await controller.restore(entry.id), false);
  assert.equal(current.txs[0].amount, 500);
});

test("a delayed recovery query cannot reopen data after the UID scope changes", async () => {
  let scope = "uid:user-a";
  let resolveList;
  const listPromise = new Promise((resolve) => { resolveList = resolve; });
  const elements = {
    modal: { classList: classList() },
    summary: { textContent: "" },
    list: { innerHTML: "", querySelectorAll: () => [] },
    empty: { classList: classList() },
    close: { focus() {} },
  };
  const controller = createRecoveryCenterController({
    elements,
    store: { getState: () => financeState(500) },
    recoveryStore: {
      list: () => listPromise,
      get: async () => null,
      remove: async () => false,
    },
    getScope: () => scope,
    commitState: () => {},
    refreshWholeStateUi: () => {},
    exportBackupFile: () => {},
    toast: { show() {} },
    escapeHTML: (value) => String(value),
    onWarn: () => {},
  });

  const opening = controller.open();
  scope = "uid:user-b";
  controller.reset();
  resolveList([{ id: "user-a-secret" }]);

  assert.equal(await opening, false);
  assert.equal(elements.modal.classList.contains("d-none"), true);
  assert.doesNotMatch(elements.list.innerHTML, /user-a-secret/);
});
