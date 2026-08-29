import assert from "node:assert/strict";
import { test } from "node:test";
import { createLifeRecordReminderController } from "../src/app/controllers/life-record-reminder-controller.js";

function createHarness() {
  const calls = [];
  const element = (value = "") => ({ value, hidden: false, textContent: "", innerHTML: "", dataset: {} });
  const elements = { panel: { open: true }, query: element(), interval: element(), status: element(), summary: element() };
  const state = {
    txs: [{ id: "tx-1", type: "expense", amount: 200, date: "2026-08-01", category: "醫療", desc: "<img src=x onerror=alert(1)>洗牙", acc: "cash" }],
    accounts: [{ id: "cash", name: "現金" }],
    sinkingFunds: [],
  };
  let scheduled = null;
  const controller = createLifeRecordReminderController({
    elements,
    store: { getState: () => state },
    now: () => new Date(2026, 7, 29),
    schedule: (callback) => { scheduled = callback; return "timer"; },
    cancelSchedule: (handle) => calls.push(["cancel", handle]),
  });
  return { calls, controller, elements, runScheduled: () => scheduled?.() };
}

test("renders a derived reminder without writing state or persistence", () => {
  const harness = createHarness();
  harness.elements.query.value = "洗牙";
  harness.elements.interval.value = "180";
  const model = harness.controller.render();
  assert.equal(model.status, "not_due");
  assert.match(harness.elements.summary.textContent, /2026-08-01/);
  assert.match(harness.elements.summary.textContent, /依 180 天試算下次/);
});

test("debounces input and reset clears all UI-only criteria and results", () => {
  const harness = createHarness();
  harness.elements.query.value = "洗牙";
  harness.elements.interval.value = "180";
  harness.controller.handleInput();
  harness.controller.handleInput();
  assert.deepEqual(harness.calls, [["cancel", "timer"]]);
  harness.runScheduled();
  assert.equal(harness.elements.summary.hidden, false);

  harness.controller.reset();
  assert.equal(harness.elements.query.value, "洗牙");
  assert.equal(harness.elements.interval.value, "");
  assert.equal(harness.elements.panel.open, false);
  assert.equal(harness.elements.summary.hidden, true);
  assert.equal(harness.elements.status.dataset.state, "idle");
});
