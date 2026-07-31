import assert from "node:assert/strict";
import { test } from "node:test";
import { createWholeStateReplacer } from "../src/app/controller-lifecycle.js";
import { createStore } from "../src/state/store.js";

test("whole-state replacement resets every controller before replacing the store", () => {
  const calls = [];
  const store = createStore(
    { marker: "old" },
    { onChange: (state) => calls.push(`replace:${state.marker}`) },
  );
  const controllers = [
    { reset: () => calls.push(`reset:first:${store.getState().marker}`) },
    { reset: () => calls.push(`reset:second:${store.getState().marker}`) },
  ];
  const replaceWholeState = createWholeStateReplacer({ store, controllers });

  replaceWholeState({ marker: "new" });

  assert.deepEqual(calls, [
    "reset:first:old",
    "reset:second:old",
    "replace:new",
  ]);
  assert.equal(store.getState().marker, "new");
});

test("whole-state replacement rejects controllers without a reset contract", () => {
  const store = createStore({ marker: "old" });

  assert.throws(
    () => createWholeStateReplacer({ store, controllers: [{}] }),
    /controller-reset-required/,
  );
});
