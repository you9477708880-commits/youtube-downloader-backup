import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommitState, createScopedLocalPersist } from "../src/app/state-commit.js";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";
import { normalizeFinanceStateMoney } from "../src/utils/normalize-state.js";

function setup(overrides = {}) {
  const calls = [];
  const initialState = createInitialState();
  initialState.settings.budgetCap = 1000;
  const store = createStore(initialState, {
    onChange: (state) => calls.push(["replace", state.settings.budgetCap]),
  });
  const persistLocal = overrides.persistLocal || ((state) => calls.push(["local", state.settings.budgetCap]));
  const enqueueCloud = overrides.enqueueCloud || ((state) => calls.push(["cloud", state.settings.budgetCap]));
  const commitState = createCommitState({
    store,
    normalizeState: (state) => {
      calls.push(["normalize", state.settings.budgetCap]);
      return normalizeFinanceStateMoney(state);
    },
    persistLocal,
    enqueueCloud,
  });
  return { calls, commitState, store };
}

test("commitState normalizes, persists, replaces, updates UI, and enqueues cloud in order", () => {
  const { calls, commitState, store } = setup();

  const committed = commitState((draft) => {
    calls.push(["mutate", draft.settings.budgetCap]);
    draft.settings.budgetCap = "2000.8";
    draft.txs.push({
      id: "tx-1",
      type: "expense",
      amount: "1000.7",
      date: "2026-08-11",
      category: "餐飲",
      acc: "a1",
    });
  }, {
    updateUi: (state) => calls.push(["ui", state.settings.budgetCap]),
  });

  assert.deepEqual(calls, [
    ["mutate", 1000],
    ["normalize", "2000.8"],
    ["local", 2001],
    ["replace", 2001],
    ["ui", 2001],
    ["cloud", 2001],
  ]);
  assert.equal(committed, store.getState());
  assert.equal(committed.txs[0].amount, 1001);
  assert.equal(committed.txs[0].subcategory, "未分類");
  assert.equal(committed.txs[0].cat, "餐飲");
});

test("commitState supports an updater-returned state without mutating the previous state", () => {
  const { commitState, store } = setup();
  const previous = store.getState();

  commitState((draft) => ({
    ...draft,
    settings: { ...draft.settings, budgetCap: "3000" },
  }), { updateUi: () => {} });

  assert.equal(previous.settings.budgetCap, 1000);
  assert.equal(store.getState().settings.budgetCap, 3000);
});

test("commitState keeps the store unchanged and skips UI and cloud when local persistence fails", () => {
  const calls = [];
  const { commitState, store } = setup({
    persistLocal: () => {
      calls.push("local");
      throw new Error("quota");
    },
    enqueueCloud: () => calls.push("cloud"),
  });
  const previous = store.getState();

  assert.throws(() => commitState((draft) => {
    draft.settings.budgetCap = 9000;
  }, { updateUi: () => calls.push("ui") }), /quota/);

  assert.equal(store.getState(), previous);
  assert.equal(store.getState().settings.budgetCap, 1000);
  assert.deepEqual(calls, ["local"]);
});

test("commitState requires every pipeline boundary", () => {
  const store = createStore(createInitialState());
  const required = {
    store,
    normalizeState: (state) => state,
    persistLocal: () => {},
    enqueueCloud: () => {},
  };

  assert.throws(() => createCommitState({ ...required, persistLocal: null }), /commit-local-persist-required/);
  const commitState = createCommitState(required);
  assert.throws(() => commitState(null, { updateUi: () => {} }), /commit-mutator-required/);
  assert.throws(() => commitState(() => {}, {}), /commit-ui-update-required/);
});

test("scoped local persistence safely claims the local namespace before auth identity is ready", () => {
  let scope = null;
  const writes = [];
  const persistLocal = createScopedLocalPersist({
    getScope: () => scope,
    setScope: (nextScope) => { scope = nextScope; },
    defaultScope: "local",
    persist: (state, targetScope) => writes.push({ state, targetScope }),
  });

  persistLocal({ marker: "startup-edit" });

  assert.equal(scope, "local");
  assert.deepEqual(writes, [{ state: { marker: "startup-edit" }, targetScope: "local" }]);
});

test("scoped local persistence does not claim a namespace when the write fails", () => {
  let scope = null;
  const persistLocal = createScopedLocalPersist({
    getScope: () => scope,
    setScope: (nextScope) => { scope = nextScope; },
    defaultScope: "local",
    persist: () => { throw new Error("quota"); },
  });

  assert.throws(() => persistLocal({ marker: "failed" }), /quota/);
  assert.equal(scope, null);
});
