import assert from "node:assert/strict";
import { test } from "node:test";
import { createLifeRecordReminderController } from "../src/app/controllers/life-record-reminder-controller.js";
import { createTransactionSearchController } from "../src/app/controllers/transaction-search-controller.js";

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
    showSearchHistory: (query) => { elements.query.value = query; calls.push(["history", query]); },
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
  assert.ok(harness.calls.some((call) => call[0] === "history" && call[1] === "洗牙"));
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

test("viewing different reminders finds year-old records and never changes report dates or writes state", () => {
  const now = () => new Date(2026, 8, 22);
  const state = {
    accounts: [], sinkingFunds: [],
    txs: [
      { id: "dental", type: "expense", amount: 100, date: "2025-07-01", desc: "洗牙" },
      { id: "oil", type: "expense", amount: 200, date: "2025-08-01", desc: "機油" },
    ],
    lifeRoutines: [
      { id: "dental-rule", query: "洗牙" },
      { id: "oil-rule", query: "機油" },
      { id: "missing-rule", query: "輪胎" },
    ],
  };
  const before = structuredClone(state);
  const reportDates = { start: "2026-09-01", end: "2026-09-30" };
  const reportBefore = { ...reportDates };
  const input = (value = "") => ({ value });
  const searchElements = {
    query: input(), preset: input("6m"), start: input(), end: input(),
    summary: {}, empty: {}, clear: {}, status: {}, customRange: {},
  };
  let displayed = [];
  const search = createTransactionSearchController({
    elements: searchElements, store: { getState: () => state }, now,
    getReportTransactions: () => state.txs.filter((tx) => tx.date >= reportDates.start && tx.date <= reportDates.end),
    renderTransactions: (txs) => { displayed = txs; },
  });
  const reminder = createLifeRecordReminderController({
    elements: { query: searchElements.query, name: input(), interval: input(), dueSoon: input(), list: {} },
    store: { getState: () => state }, now,
    commitState: () => assert.fail("viewing must not save"),
    renderSearch: search.render, showSearchHistory: search.showHistory, renderCenter() {},
  });
  searchElements.query.value = "洗牙";
  assert.equal(search.getModel().matchCount, 0);
  reminder.view("dental-rule");
  assert.equal(searchElements.preset.value, "all");
  assert.deepEqual(displayed.map((tx) => tx.id), ["dental"]);
  reminder.view("oil-rule");
  assert.deepEqual(displayed.map((tx) => tx.id), ["oil"]);
  reminder.view("missing-rule");
  assert.deepEqual(displayed, []);
  assert.equal(searchElements.empty.hidden, false);
  reminder.view("deleted-rule");
  assert.equal(searchElements.query.value, "輪胎");
  assert.deepEqual(reportDates, reportBefore);
  assert.deepEqual(state, before);
  search.clear();
  assert.deepEqual(displayed, []);
});
