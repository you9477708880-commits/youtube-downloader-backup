import assert from "node:assert/strict";
import { test } from "node:test";
import { createRenderCoordinator } from "../src/app/render-coordinator.js";

function createHarness() {
  const calls = [];
  const state = { marker: "state" };
  const views = Object.fromEntries([
    "renderBalanceSheet",
    "renderCashFlow",
    "renderGoalCenter",
    "renderLedger",
    "renderMonthlyReview",
    "renderOverview",
    "renderRetirement",
    "renderWishlist",
  ].map((name) => [name, (input) => calls.push([name, input])]));
  const ui = Object.fromEntries([
    "syncFromSettings",
    "renderTransactionCategorySelect",
    "populateCategoryBudgetOptions",
    "populateFundOptions",
    "syncTxType",
  ].map((name) => [name, () => calls.push([name])]));
  const dom = { goalCenter: { dataset: { filter: "ready" } } };
  const coordinator = createRenderCoordinator({
    store: { getState: () => state },
    dom,
    constants: { marker: "constants" },
    utils: { marker: "utils" },
    ui,
    getFilterRange: () => ({ start: "2026-08-01", end: "2026-08-31" }),
    getFilteredTransactions: () => [{ id: "tx-1" }],
    views,
  });
  return { calls, coordinator, dom, state };
}

test("render coordinator owns the complete render order and ledger fallback", () => {
  const { calls, coordinator, state } = createHarness();
  coordinator.renderAll();
  assert.deepEqual(calls.map(([name]) => name), [
    "renderOverview",
    "renderMonthlyReview",
    "renderLedger",
    "renderCashFlow",
    "renderBalanceSheet",
    "renderGoalCenter",
    "renderWishlist",
    "renderRetirement",
  ]);
  assert.equal(calls[0][1].state, state);
  assert.deepEqual(calls[0][1].filteredTxs, [{ id: "tx-1" }]);
});

test("bound search and reminder controllers replace only their owned render slots", () => {
  const { calls, coordinator } = createHarness();
  coordinator.bindFeatureControllers({
    transactionSearch: { render: () => calls.push(["search"] ) },
    lifeRecordReminder: { render: () => calls.push(["life"] ) },
  });
  coordinator.renderAll();
  assert.equal(calls.some(([name]) => name === "renderLedger"), false);
  assert.deepEqual(calls.map(([name]) => name), [
    "renderOverview",
    "renderMonthlyReview",
    "search",
    "life",
    "renderCashFlow",
    "renderBalanceSheet",
    "renderGoalCenter",
    "renderWishlist",
    "renderRetirement",
  ]);
});

test("whole-state refresh resets UI-derived inputs once before one full render", () => {
  const { calls, coordinator, dom } = createHarness();
  coordinator.refreshWholeStateUi();
  assert.equal(dom.goalCenter.dataset.filter, "all");
  assert.deepEqual(calls.slice(0, 5).map(([name]) => name), [
    "syncFromSettings",
    "renderTransactionCategorySelect",
    "populateCategoryBudgetOptions",
    "populateFundOptions",
    "syncTxType",
  ]);
  assert.equal(calls.filter(([name]) => name === "renderOverview").length, 1);
});
