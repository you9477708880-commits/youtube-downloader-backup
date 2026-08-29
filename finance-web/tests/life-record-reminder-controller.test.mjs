import assert from "node:assert/strict";
import { test } from "node:test";
import { createLifeRecordReminderController } from "../src/app/controllers/life-record-reminder-controller.js";

function createHarness() {
  let state = {
    txs: [{ id: "tx-1", type: "expense", amount: 200, date: "2026-08-01", category: "醫療", desc: "洗牙", acc: "cash" }],
    accounts: [{ id: "cash", name: "現金" }],
    sinkingFunds: [],
    lifeRoutines: [],
  };
  const calls = [];
  const input = (value = "") => ({ value, hidden: false, textContent: "", focus() { calls.push("focus"); }, scrollIntoView() { calls.push("scroll"); } });
  const elements = {
    panel: { open: false }, heading: input(), query: input("洗牙"), name: input(), interval: input("180"),
    dueSoon: input("14"), save: input("儲存提醒"), cancel: input(), list: {},
  };
  const commitState = (mutator, { updateUi }) => {
    const draft = structuredClone(state);
    mutator(draft);
    state = draft;
    calls.push("commit");
    updateUi();
  };
  const controller = createLifeRecordReminderController({
    elements,
    store: { getState: () => state },
    commitState,
    toast: { show: (message, type) => calls.push(["toast", message, type]) },
    renderSearch: () => calls.push("search"),
    now: () => new Date("2026-08-29T12:00:00.000Z"),
    createId: () => "routine-1",
    renderCenter: ({ model }) => calls.push(["render", model.total]),
  });
  return { calls, controller, elements, getState: () => state };
}

test("creates, edits, toggles, views, and deletes one saved routine through commitState", () => {
  const harness = createHarness();
  harness.elements.interval.value = "180";
  assert.equal(harness.controller.save(), true);
  assert.deepEqual(harness.getState().lifeRoutines[0], {
    id: "routine-1", name: "洗牙", query: "洗牙", expectedIntervalDays: 180, dueSoonDays: 14,
    enabled: true, createdAt: "2026-08-29T12:00:00.000Z", updatedAt: "2026-08-29T12:00:00.000Z",
  });

  harness.controller.beginEdit("routine-1");
  harness.elements.name.value = "每半年洗牙";
  harness.elements.interval.value = "170";
  harness.controller.save();
  assert.equal(harness.getState().lifeRoutines[0].name, "每半年洗牙");
  assert.equal(harness.getState().lifeRoutines[0].expectedIntervalDays, 170);

  harness.controller.toggle("routine-1");
  assert.equal(harness.getState().lifeRoutines[0].enabled, false);
  harness.controller.view("routine-1");
  assert.equal(harness.elements.query.value, "洗牙");
  assert.ok(harness.calls.includes("search"));
  harness.controller.remove("routine-1");
  assert.deepEqual(harness.getState().lifeRoutines, []);
});

test("rejects missing query and invalid intervals without committing", () => {
  const harness = createHarness();
  harness.elements.query.value = "";
  assert.equal(harness.controller.save(), false);
  harness.elements.query.value = "洗牙";
  harness.elements.interval.value = "0";
  assert.equal(harness.controller.save(), false);
  harness.elements.interval.value = "180";
  harness.elements.dueSoon.value = "400";
  assert.equal(harness.controller.save(), false);
  assert.equal(harness.calls.includes("commit"), false);
});
