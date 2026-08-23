import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMonthlyReviewData, getPreviousComparableRange } from "../src/domain/monthly-review.js";
import { renderMonthlyReview } from "../src/views/monthly-review-view.js";

function sampleState() {
  return {
    txs: [
      { id: "jul-income", type: "income", amount: 40000, date: "2026-07-05", acc: "bank", category: "薪資", cat: "薪資" },
      { id: "jul-food", type: "expense", amount: 3000, date: "2026-07-10", acc: "bank", category: "餐飲", cat: "餐飲" },
      { id: "aug-income", type: "income", amount: 50000, date: "2026-08-05", acc: "bank", category: "薪資", cat: "薪資" },
      { id: "aug-food", type: "expense", amount: 5000, date: "2026-08-10", acc: "bank", category: "餐飲", cat: "餐飲" },
      { id: "aug-traffic", type: "expense", amount: 1000, date: "2026-08-12", acc: "bank", category: "交通", cat: "交通" },
    ],
    sinkingFunds: [],
    accounts: [{ id: "bank", name: "銀行", type: "asset", initialBalance: 100000 }],
    bsI: [], wishes: [], userCats: { income: [], expense: [] },
    settings: { budgetCap: 30000, catBudgets: {} },
  };
}

test("previous comparison range uses the same inclusive number of days", () => {
  assert.deepEqual(getPreviousComparableRange({ start: "2026-08-01", end: "2026-08-31" }), { start: "2026-07-01", end: "2026-07-31" });
  assert.deepEqual(getPreviousComparableRange({ start: "2026-03-01", end: "2026-03-07" }), { start: "2026-02-22", end: "2026-02-28" });
  assert.equal(getPreviousComparableRange({ start: "bad", end: "2026-08-31" }), null);
  assert.equal(getPreviousComparableRange({ start: "2000-01-01", end: "2026-08-31" }), null);
});

test("monthly review compares traceable values without changing state", () => {
  const state = sampleState();
  const before = structuredClone(state);
  const review = calculateMonthlyReviewData(state, { start: "2026-08-01", end: "2026-08-31" });

  assert.equal(review.comparison.metrics.income.current, 50000);
  assert.equal(review.comparison.metrics.income.previous, 40000);
  assert.equal(review.comparison.metrics.livingExpense.delta, 3000);
  assert.deepEqual(review.navigation.metrics.map((metric) => [metric.id, metric.value]), [
    ["income", 50000],
    ["expense", 6000],
    ["assets", 181000],
    ["liabilities", 0],
  ]);
  assert.equal(review.navigation.questions.length, 2);
  assert.deepEqual(review.comparison.largestCategoryChange, {
    category: "餐飲", current: 5000, previous: 3000, delta: 2000,
  });
  assert.deepEqual(state, before);
});

test("monthly review renders comparison progressively and escapes category text", () => {
  const state = sampleState();
  state.txs.at(-1).category = '<img src=x onerror="bad">';
  state.txs.at(-1).cat = state.txs.at(-1).category;
  const dom = { monthlyReview: { innerHTML: "" } };
  const utils = {
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  };

  renderMonthlyReview({ state, filterRange: { start: "2026-08-01", end: "2026-08-31" }, utils, dom });

  assert.match(dom.monthlyReview.innerHTML, /<details class="review-comparison">/);
  assert.match(dom.monthlyReview.innerHTML, /與上期比較/);
  assert.match(dom.monthlyReview.innerHTML, /財務導航/);
  assert.match(dom.monthlyReview.innerHTML, /4 個數字＋2 個自評問題/);
  assert.match(dom.monthlyReview.innerHTML, /不評分，也不保存自評答案/);
  assert.match(dom.monthlyReview.innerHTML, /只比較相同天數/);
  assert.doesNotMatch(dom.monthlyReview.innerHTML, /<img src=x/);
  assert.match(dom.monthlyReview.innerHTML, /&lt;img/);
});
