// Synthetic in-memory storage: no browser profile, disk account data or cloud IO.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createCommitState } from "../src/app/state-commit.js";
import { createStore } from "../src/state/store.js";
import { createInitialState } from "../src/state/initial-state.js";
import { normalizeFinanceStateMoney } from "../src/utils/normalize-state.js";
import { saveLocalState, loadLocalState } from "../src/services/storage-local.js";

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const size of [450, 5000, 20000]) {
  const initial = createInitialState();
  initial.txs = Array.from({ length: size }, (_, i) => ({ id: `bench-${i}`, date: "2026-09-01", type: "expense", amount: 100,
    acc: initial.accounts[0].id, category: "餐飲", subcategory: "午餐", desc: "synthetic benchmark" }));
  const samples = [];
  for (let run = 0; run < 6; run += 1) {
    const map = new Map();
    const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
    const store = createStore(initial);
    const times = {};
    const timed = (key, fn) => (...args) => {
      const start = performance.now();
      const result = fn(...args);
      times[key] = performance.now() - start;
      return result;
    };
    store.replace = timed("replaceMs", store.replace);
    const commit = createCommitState({ store,
      normalizeState: timed("normalizeMs", normalizeFinanceStateMoney),
      persistLocal: timed("localSerializeMs", (state) => saveLocalState(state, "local", storage)),
      enqueueCloud() {},
    });
    const start = performance.now();
    commit((state) => { state.txs[0].amount = 101; }, { updateUi() {} });
    times.totalMs = performance.now() - start;
    times.cloneAndOverheadMs = times.totalMs - times.normalizeMs - times.localSerializeMs - times.replaceMs;
    assert.deepEqual(loadLocalState(createInitialState(), "local", storage), store.getState());
    assert.equal(initial.txs[0].amount, 100);
    if (run) samples.push(times);
  }
  console.log(JSON.stringify({ size, node: process.version, ...Object.fromEntries(Object.keys(samples[0]).map((key) => [key, +median(samples.map((sample) => sample[key])).toFixed(3)])) }));
}
