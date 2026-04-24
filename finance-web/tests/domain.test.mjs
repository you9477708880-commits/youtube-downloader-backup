import assert from "node:assert/strict";

import { calculateAccountBalances, calculateBalanceSheet } from "../src/domain/accounts.js";
import { buildSpreadSchedule, calculateBudgetData, getBudgetAmountForRange } from "../src/domain/budget.js";
import {
  getAdvanceOutstanding,
  getOpenAdvances,
  getPersonalExpenseAmount,
  summarizeCashFlow,
  summarizeOverview,
} from "../src/domain/transactions.js";
import {
  getTransactionAccountIds,
  getTransactionSignedAmount,
} from "../src/views/transaction-detail-view.js";

const accounts = [
  { id: "cash", name: "現金", type: "asset", initialBalance: 10000 },
  { id: "bank", name: "銀行", type: "asset", initialBalance: 0 },
  { id: "card", name: "信用卡", type: "asset", initialBalance: 0 },
];

const txs = [
  {
    id: 1,
    type: "income",
    amount: 40000,
    desc: "四月薪水",
    date: "2026-04-01",
    cat: "薪資",
    acc: "bank",
  },
  {
    id: 2,
    type: "expense",
    amount: 1000,
    desc: "午餐",
    date: "2026-04-02",
    cat: "餐飲",
    acc: "cash",
  },
  {
    id: 3,
    type: "transfer",
    amount: 5000,
    desc: "補現金",
    date: "2026-04-03",
    cat: "轉帳",
    fromAcc: "bank",
    toAcc: "cash",
  },
  {
    id: 4,
    type: "advance",
    amount: 5000,
    ownAmount: 1000,
    receivableAmount: 4000,
    person: "家人",
    desc: "聚餐代墊",
    date: "2026-04-04",
    cat: "餐飲",
    acc: "card",
  },
  {
    id: 5,
    type: "advance_repayment",
    advanceId: 4,
    amount: 2500,
    date: "2026-04-05",
    acc: "bank",
    cat: "代墊收款",
    desc: "家人還款",
    person: "家人",
  },
  {
    id: 6,
    type: "income",
    amount: 1200,
    desc: "股息",
    date: "2026-04-06",
    cat: "股息收入",
    acc: "bank",
  },
  {
    id: 7,
    type: "expense",
    amount: 24000,
    desc: "日本旅遊",
    date: "2026-04-20",
    cat: "旅遊與行程",
    acc: "bank",
    budgetMode: "spread",
    spreadMonths: 12,
    spreadStartMonth: "2026-04",
    spreadLabel: "旅遊基金",
  },
];

const state = {
  txs,
  accounts,
  bsI: [
    { id: "fund", name: "基金", amount: 8000, cat: "asset", isEm: false },
    { id: "loan", name: "貸款", amount: 3000, cat: "liability", isEm: false },
  ],
  settings: {
    budgetCap: 20000,
    budgetViewMode: "actual",
    catBudgets: {
      餐飲: 5000,
      "旅遊與行程": 4000,
    },
  },
};

function testOverviewAndCashFlow() {
  const overview = summarizeOverview(txs);
  assert.equal(overview.income, 41200, "收入只應包含 income，不包含代墊收款");
  assert.equal(overview.expense, 26000, "總覽仍應保留原始支出全額");
  assert.equal(overview.net, 15200);

  const cashflow = summarizeCashFlow(txs);
  assert.equal(cashflow.operatingIncome, 40000);
  assert.equal(cashflow.operatingExpense, 26000);
  assert.equal(cashflow.investingIncome, 1200);
  assert.equal(cashflow.netOperating, 14000);
  assert.equal(cashflow.netTotal, 15200);
}

function testAccountBalances() {
  const balances = calculateAccountBalances(state);
  assert.equal(balances.cash, 14000, "現金 = 10000 - 1000 + 5000");
  assert.equal(balances.bank, 14700, "銀行 = 40000 - 5000 + 2500 + 1200 - 24000");
  assert.equal(balances.card, -5000, "信用卡應反映代墊全額流出");
}

function testAdvanceReceivable() {
  const advance = txs.find((tx) => tx.type === "advance");
  assert.equal(getPersonalExpenseAmount(advance), 1000);
  assert.equal(getAdvanceOutstanding(txs, advance), 1500);

  const openAdvances = getOpenAdvances(txs);
  assert.equal(openAdvances.length, 1);
  assert.equal(openAdvances[0].outstandingAmount, 1500);
  assert.equal(openAdvances[0].repaidAmount, 2500);
}

function testBudget() {
  const actualBudget = calculateBudgetData(state, { start: "2026-04-01", end: "2026-04-30" });
  assert.equal(actualBudget.expense, 26000, "實際模式應保留旅遊全額");
  assert.equal(actualBudget.available, 0);
  assert.equal(actualBudget.planningRoom, 16000);
  assert.equal(actualBudget.remaining, -6000);
  assert.equal(actualBudget.categoryBudgets.find((item) => item.category === "餐飲").expense, 2000);
  assert.equal(actualBudget.categoryBudgets.find((item) => item.category === "旅遊與行程").items[0].amount, 24000);

  const spreadState = {
    ...state,
    settings: {
      ...state.settings,
      budgetViewMode: "spread",
    },
  };
  const spreadBudget = calculateBudgetData(spreadState, { start: "2026-04-01", end: "2026-04-30" });
  assert.equal(spreadBudget.expense, 4000, "分攤模式下旅遊 24000/12 應只認列 2000");
  assert.equal(spreadBudget.available, 0, "可自由運用仍應看實際支出");
  assert.equal(spreadBudget.planningRoom, 16000, "月預算餘裕應看分攤後支出");
  assert.equal(spreadBudget.remaining, 16000);
  assert.equal(spreadBudget.categoryBudgets.find((item) => item.category === "旅遊與行程").expense, 2000);
  assert.equal(spreadBudget.categoryBudgets.find((item) => item.category === "旅遊與行程").items[0].isSpread, true);
  assert.equal(spreadBudget.spreadItems.length, 1);
  assert.equal(spreadBudget.spreadItems[0].periodAmount, 2000);
}

function testBalanceSheet() {
  const sheet = calculateBalanceSheet(state);
  assert.equal(sheet.receivableTotal, 1500);
  assert.equal(sheet.totalAssets, 38200, "正帳戶 28700 + 手動資產 8000 + 應收 1500");
  assert.equal(sheet.totalLiabilities, 8000, "負帳戶 5000 + 手動負債 3000");
  assert.equal(sheet.netWorth, 30200);
}

function testTraceabilityHelpers() {
  const transfer = txs.find((tx) => tx.type === "transfer");
  const advance = txs.find((tx) => tx.type === "advance");
  const repayment = txs.find((tx) => tx.type === "advance_repayment");

  assert.deepEqual(getTransactionAccountIds(transfer), ["bank", "cash"]);
  assert.deepEqual(getTransactionAccountIds(advance), ["card"]);
  assert.equal(getTransactionSignedAmount(transfer, "bank"), -5000);
  assert.equal(getTransactionSignedAmount(transfer, "cash"), 5000);
  assert.equal(getTransactionSignedAmount(advance, "card"), -5000);
  assert.equal(getTransactionSignedAmount(repayment, "bank"), 2500);
  assert.equal(getTransactionSignedAmount(advance), -1000, "報表一般視角下代墊只認列自負額");
}

function testSpreadHelpers() {
  const spreadTx = txs.find((tx) => tx.budgetMode === "spread");
  const schedule = buildSpreadSchedule(spreadTx);
  assert.equal(schedule.length, 12);
  assert.equal(schedule[0].amount, 2000);
  assert.equal(getBudgetAmountForRange(spreadTx, { start: "2026-04-01", end: "2026-04-30" }, "spread"), 2000);
  assert.equal(getBudgetAmountForRange(spreadTx, { start: "2026-04-01", end: "2026-12-31" }, "spread"), 18000);
  assert.equal(getBudgetAmountForRange(spreadTx, { start: "2027-01-01", end: "2027-03-31" }, "spread"), 6000);
}

testOverviewAndCashFlow();
testAccountBalances();
testAdvanceReceivable();
testBudget();
testBalanceSheet();
testTraceabilityHelpers();
testSpreadHelpers();

console.log("Domain tests passed");
