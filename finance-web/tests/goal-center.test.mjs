import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGoalCenterData } from "../src/domain/goal-center.js";
import { calculateBudgetData } from "../src/domain/budget.js";
import { renderGoalCenter } from "../src/views/goal-center-view.js";

const range = { start: "2026-08-01", end: "2026-08-31" };

function createState() {
  return {
    txs: [{ id: "tx-1", type: "expense", amount: 2000, date: "2026-08-05", cat: "生活", desc: "餐費" }],
    sinkingFunds: [
      {
        id: "fund-1",
        name: "旅行基金",
        category: "旅行",
        targetAmount: 30000,
        monthlyContribution: 1000,
        startMonth: "2026-08",
        targetMonth: "2026-10",
        events: [{ id: "topup-1", type: "topup", amount: 500, date: "2026-08-03" }],
      },
      {
        id: "fund-2",
        name: "長期設備",
        category: "3C",
        targetAmount: 10000,
        monthlyContribution: 1000,
        startMonth: "2026-08",
        targetMonth: "",
        events: [],
      },
    ],
    wishes: [
      { id: "wish-1", name: "新耳機", cat: "3C", price: 2000 },
      { id: "wish-2", name: "新相機", cat: "攝影", price: 10000 },
    ],
    settings: { budgetCap: 9000, catBudgets: {} },
  };
}

test("goal center derives allocation and fund summaries from existing budget truth without mutation", () => {
  const state = createState();
  const before = structuredClone(state);
  const model = buildGoalCenterData(state, range);
  const budget = calculateBudgetData(state, range);

  assert.equal(model.allocationRoom, budget.freeToUse);
  assert.equal(model.plannedFundContribution, budget.fundContribution);
  assert.equal(model.manualTopups, budget.manualTopups);
  assert.equal(model.activeFundGoals.length, 2);
  assert.equal(model.attentionItems.length, 1);
  assert.deepEqual(model.attentionItems[0], {
    id: "fund-plan:fund-1",
    kind: "fund-plan-shortfall",
    goalId: "fund-1",
    title: "旅行基金",
    amount: 27000,
  });
  assert.equal(model.wishCandidates[0].withinBudget, true);
  assert.equal(model.wishCandidates[1].withinBudget, false);
  assert.deepEqual(state, before);
});

test("goal center view escapes content, filters only the UI, and reuses existing actions", () => {
  const state = createState();
  state.wishes[0].name = '<img src=x onerror="bad">';
  const before = structuredClone(state);
  const dom = { goalCenter: { dataset: { filter: "considering" }, innerHTML: "" } };
  const utils = {
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
  };

  renderGoalCenter({ state, filterRange: range, utils, dom });

  assert.match(dom.goalCenter.innerHTML, /目標中心/);
  assert.match(dom.goalCenter.innerHTML, /data-action="prepare-fund-from-wish"/);
  assert.match(dom.goalCenter.innerHTML, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  assert.doesNotMatch(dom.goalCenter.innerHTML, /<img src=x/);
  assert.match(dom.goalCenter.innerHTML, /goal-center-attention" hidden/);
  assert.match(dom.goalCenter.innerHTML, /goal-center-pane" hidden/);
  assert.match(dom.goalCenter.innerHTML, /期限前仍差 NT\$ 27,000/);
  assert.equal(dom.goalCenter.dataset.filter, "considering");
  assert.deepEqual(state, before);
});

test("empty goal center remains stable for every ephemeral filter", () => {
  const state = { txs: [], sinkingFunds: [], wishes: [], settings: { budgetCap: 0, catBudgets: {} } };
  const utils = { formatMoney: (value) => `NT$ ${value}`, escapeHTML: String };

  for (const filter of ["all", "active", "considering", "invalid"]) {
    const dom = { goalCenter: { dataset: { filter }, innerHTML: "" } };
    renderGoalCenter({ state, filterRange: range, utils, dom });
    assert.match(dom.goalCenter.innerHTML, /目標中心/);
    assert.match(dom.goalCenter.innerHTML, /目前沒有/);
    assert.equal(dom.goalCenter.dataset.filter, filter === "invalid" ? "all" : filter);
  }
});
