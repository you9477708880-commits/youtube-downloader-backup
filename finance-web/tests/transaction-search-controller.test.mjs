import assert from "node:assert/strict";
import { test } from "node:test";
import { createTransactionSearchController } from "../src/app/controllers/transaction-search-controller.js";

function createHarness() {
  const calls = [];
  const transactions = [
    { id: "current", type: "expense", amount: 200, date: "2026-08-01", category: "醫療", subcategory: "牙科", desc: "洗牙", acc: "cash" },
    { id: "older", type: "expense", amount: 150, date: "2026-01-20", category: "醫療", subcategory: "牙科", desc: "洗牙", acc: "cash" },
  ];
  const state = { txs: transactions, accounts: [{ id: "cash", name: "現金" }], sinkingFunds: [] };
  const element = (value = "") => ({ value, hidden: false, disabled: false, textContent: "" });
  const elements = {
    query: element(),
    preset: element("6m"),
    start: element(),
    end: element(),
    clear: element(),
    customRange: element(),
    status: element(),
    summary: element(),
    empty: element(),
  };
  elements.query.focus = () => calls.push("focus");
  let scheduled = null;
  const controller = createTransactionSearchController({
    elements,
    store: { getState: () => state },
    getReportTransactions: () => [transactions[0]],
    renderTransactions: (items) => calls.push(["render", items.map((item) => item.id)]),
    now: () => new Date(2026, 7, 13),
    schedule: (callback) => { scheduled = callback; return "timer"; },
    cancelSchedule: (handle) => calls.push(["cancel", handle]),
  });
  return { calls, controller, elements, runScheduled: () => scheduled?.() };
}

test("blank query uses report transactions and does not expose search summary", () => {
  const harness = createHarness();
  const model = harness.controller.render();
  assert.deepEqual(model.matches.map((item) => item.id), ["current"]);
  assert.equal(harness.elements.summary.hidden, true);
  assert.match(harness.elements.status.textContent, /不影響月度報表/);
});

test("active query uses an independent six-month range and renders occurrence summary", () => {
  const harness = createHarness();
  harness.elements.query.value = "洗牙";
  const model = harness.controller.render();
  assert.deepEqual(model.matches.map((item) => item.id), ["current"]);
  assert.equal(model.range.start, "2026-02-13");
  assert.match(harness.elements.status.textContent, /不影響月度報表/);
  assert.match(harness.elements.summary.textContent, /最近一次：2026-08-01/);
  assert.equal(harness.elements.clear.disabled, false);
});

test("input rendering is scheduled and repeated input cancels the previous render", () => {
  const harness = createHarness();
  harness.elements.query.value = "洗牙";
  harness.controller.handleQueryInput();
  harness.controller.handleQueryInput();
  assert.deepEqual(harness.calls, [["cancel", "timer"]]);
  harness.runScheduled();
  assert.deepEqual(harness.calls.at(-1), ["render", ["current"]]);
});

test("custom period is initialized safely and remains independent from report dates", () => {
  const harness = createHarness();
  harness.elements.query.value = "洗牙";
  harness.elements.preset.value = "custom";
  harness.controller.handlePresetChange();
  assert.equal(harness.elements.start.value, "2026-02-13");
  assert.equal(harness.elements.end.value, "2026-08-13");
  assert.equal(harness.elements.customRange.hidden, false);
});

test("clear renders the report view while lifecycle reset clears state without rendering", () => {
  const harness = createHarness();
  harness.elements.query.value = "洗牙";
  harness.controller.clear();
  assert.equal(harness.elements.query.value, "");
  assert.deepEqual(harness.calls[0], ["render", ["current"]]);
  assert.equal(harness.calls[1], "focus");

  harness.calls.length = 0;
  harness.elements.query.value = "汽車";
  harness.elements.preset.value = "all";
  harness.controller.reset();
  assert.equal(harness.elements.query.value, "");
  assert.equal(harness.elements.preset.value, "6m");
  assert.deepEqual(harness.calls, []);
});
