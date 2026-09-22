import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommitState } from "../src/app/state-commit.js";
import { createStore } from "../src/state/store.js";

function fixture(enqueue) {
  const store = createStore({ value: 0 });
  const writes = [];
  const queues = [];
  const issues = [];
  let context = 0;
  const commit = createCommitState({
    store, normalizeState: (s) => s,
    persistLocal: (s) => writes.push(structuredClone(s)),
    enqueueCloud: enqueue || ((s) => { queues.push(structuredClone(s)); }),
    getContext: () => context,
    onPostCommitIssue: (issue) => issues.push(issue),
  });
  return { store, writes, queues, issues, commit, switchContext: () => { context++; } };
}

test("a failed UI still queues the locally committed snapshot and reports saved status", () => {
  const f = fixture();
  assert.doesNotThrow(() => f.commit((s) => { s.value = 1; }, { updateUi: () => { throw Error("render"); } }));
  assert.deepEqual(f.writes, [{ value: 1 }]);
  assert.deepEqual(f.queues, [{ value: 1 }]);
  assert.equal(f.issues[0].phase, "ui");
  assert.equal(f.issues[0].localSaved, true);
});

test("sync enqueue throws or rejects without relabeling committed data as unsaved", async () => {
  for (const enqueue of [() => { throw Error("queue"); }, () => Promise.reject(Error("queue"))]) {
    const f = fixture(enqueue);
    f.commit((s) => { s.value = 2; }, { updateUi: () => {} });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.store.getState().value, 2);
    assert.equal(f.issues[0].phase, "cloud");
    assert.equal(f.issues[0].localSaved, true);
  }
});

test("a reentrant commit queues only the newer durable state", () => {
  const f = fixture();
  f.commit((s) => { s.value = 1; }, { updateUi: () => {
    f.commit((s) => { s.value = 2; }, { updateUi: () => {} });
  } });
  assert.deepEqual(f.writes, [{ value: 1 }, { value: 2 }]);
  assert.deepEqual(f.queues, [{ value: 2 }]);
});

test("store listener exceptions do not interrupt the committed snapshot queue", () => {
  const f = fixture();
  f.store.subscribe(() => { throw Error("listener"); });
  f.commit((s) => { s.value = 1; }, { updateUi: () => {} });
  assert.deepEqual(f.queues, [{ value: 1 }]);
  assert.equal(f.issues[0].phase, "store");
});

test("store listener reentry supersedes the outer UI and enqueue", () => {
  const f = fixture();
  const renders = [];
  f.store.subscribe((state) => {
    if (state.value === 1) f.commit((s) => { s.value = 2; }, { updateUi: () => renders.push(2) });
  });
  f.commit((s) => { s.value = 1; }, { updateUi: () => renders.push(1) });
  assert.deepEqual(f.queues, [{ value: 2 }]);
  assert.deepEqual(renders, [2]);
});

test("scope switches during UI cannot enqueue or notify against the new user", async () => {
  const f = fixture();
  f.commit((s) => { s.value = 1; }, { updateUi: () => {
    f.switchContext();
    f.store.replace({ value: 99 });
    throw Error("old-ui");
  } });
  assert.deepEqual(f.queues, []);
  assert.deepEqual(f.issues, []);
  let reject;
  const g = fixture(() => new Promise((_, fail) => { reject = fail; }));
  g.commit((s) => { s.value = 1; }, { updateUi: () => {} });
  g.switchContext();
  reject(Error("old-queue"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(g.issues, []);
});
