import assert from "node:assert/strict";
import { test } from "node:test";
import { createRenderModels } from "../src/app/render-models.js";
import { createInitialState } from "../src/state/initial-state.js";
import { calculateBudgetData } from "../src/domain/budget.js";
import { calculateAccountBalances, calculateBalanceSheet } from "../src/domain/accounts.js";
import { calculateMonthlyReviewData } from "../src/domain/monthly-review.js";
import { buildGoalCenterData } from "../src/domain/goal-center.js";
import { calculateAccountCenter } from "../src/domain/account-center.js";

const range = { start: "2026-08-01", end: "2026-08-31" };
function fixture() {
  const state = createInitialState();
  const acc = state.accounts[0].id;
  state.txs = [
    { id: "income", type: "income", amount: 30000, date: "2026-08-01", acc, cat: "薪資" },
    { id: "expense", type: "expense", amount: 1200, date: "2026-08-02", acc, cat: "食品" },
    { id: "advance", type: "advance", amount: 600, receivableAmount: 400, ownAmount: 200, date: "2026-08-03", acc },
    { id: "repayment", type: "advance_repayment", amount: 100, advanceId: "advance", date: "2026-08-04", acc },
  ];
  return state;
}

test("render models are lazy and share reference results only within a render", () => {
  assert.doesNotThrow(() => createRenderModels({}, range));
  const state = fixture();
  const before = structuredClone(state);
  const model = createRenderModels(state, range);
  assert.equal(model.budget, model.budget);
  assert.equal(model.balances, model.balances);
  assert.equal(model.balanceSheet, model.balanceSheet);
  assert.equal(model.openAdvances, model.openAdvances);
  assert.deepEqual(model.budget, calculateBudgetData(state, range));
  assert.deepEqual(model.balances, calculateAccountBalances(state));
  assert.deepEqual(model.balanceSheet, calculateBalanceSheet(state));
  assert.deepEqual(state, before);
  const next = createRenderModels(state, range);
  assert.notEqual(next.budget, model.budget);
  assert.notEqual(next.balances, model.balances);
});

test("shared and standalone reports keep identical accounting outputs", () => {
  const state = fixture();
  const model = createRenderModels(state, range);
  assert.deepEqual(calculateMonthlyReviewData(state, range, model), calculateMonthlyReviewData(state, range));
  assert.deepEqual(buildGoalCenterData(state, range, model), buildGoalCenterData(state, range));
  const today = new Date(2026, 7, 10);
  assert.deepEqual(calculateAccountCenter(state, today, model), calculateAccountCenter(state, today));
});

test("new commits, account identities and report ranges cannot reuse earlier results", () => {
  const state = fixture();
  const previous = createRenderModels(state, range);
  const before = structuredClone(previous.balances);
  const next = structuredClone(state);
  next.txs[0].amount += 500;
  assert.notDeepEqual(createRenderModels(next, range).balances, before);
  assert.deepEqual(previous.balances, before);
  const empty = createInitialState();
  assert.deepEqual(createRenderModels(empty, range).balances, calculateAccountBalances(empty));
  const otherRange = { start: "2026-09-01", end: "2026-09-30" };
  assert.deepEqual(createRenderModels(next, otherRange).budget, calculateBudgetData(next, otherRange));
});
