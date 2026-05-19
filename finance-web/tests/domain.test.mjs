import assert from "node:assert/strict";

import { DELETED_ACCOUNT_FALLBACK_ID, calculateAccountBalances, calculateBalanceSheet } from "../src/domain/accounts.js";
import { calculateBudgetData } from "../src/domain/budget.js";
import { calculateRetirementProjection } from "../src/domain/retirement.js";
import {
  getFundSavedAmountAsOf,
  getFundTargetPlanStatus,
  withoutFundEventsLinkedToTransaction,
} from "../src/domain/sinking-funds.js";
import {
  buildAdvanceRepayment,
  buildTransaction,
  getAdvanceOutstanding,
  getAdvanceRepaidAmount,
  getOpenAdvances,
  getPersonalExpenseAmount,
  summarizeCashFlow,
  summarizeOverview,
} from "../src/domain/transactions.js";
import {
  getTransactionAccountIds,
  getTransactionSignedAmount,
} from "../src/views/transaction-detail-view.js";
import { renderLedger } from "../src/views/ledger-view.js";
import { renderWishlist } from "../src/views/wishlist-view.js";
import { renderBalanceSheet } from "../src/views/balance-sheet-view.js";
import { renderRetirement } from "../src/views/retirement-view.js";
import { isValidImportShape } from "../src/services/import-export.js";
import { loadLocalState } from "../src/services/storage-local.js";
import { createInitialState } from "../src/state/initial-state.js";
import { escapeHTML, formatMoney, toMoneyInt } from "../src/utils/format.js";
import { normalizeFinanceStateMoney } from "../src/utils/normalize-state.js";

const accounts = [
  { id: "cash", name: "現金", type: "asset", initialBalance: 10000 },
  { id: "bank", name: "銀行", type: "asset", initialBalance: 0 },
  { id: "card", name: "信用卡", type: "liability", initialBalance: 0 },
];

const txs = [
  { id: 1, type: "income", amount: 40000, desc: "四月薪水", date: "2026-04-01", cat: "薪資", acc: "bank" },
  { id: 2, type: "expense", amount: 1000, desc: "烤鴨", date: "2026-04-02", cat: "餐飲", acc: "cash" },
  { id: 3, type: "transfer", amount: 5000, desc: "領現", date: "2026-04-03", cat: "轉帳", fromAcc: "bank", toAcc: "cash" },
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
    desc: "家人收款",
    person: "家人",
  },
  { id: 6, type: "income", amount: 1200, desc: "股息", date: "2026-04-06", cat: "投資收益", acc: "bank" },
  { id: 7, type: "expense", amount: 20000, desc: "手機", date: "2026-04-20", cat: "其他支出", acc: "bank" },
];

const state = {
  txs,
  accounts,
  bsI: [
    { id: "fund", name: "基金", amount: 8000, cat: "asset", isEm: false },
    { id: "loan", name: "貸款", amount: 3000, cat: "liability", isEm: false },
  ],
  wishes: [
    { id: 1, name: "電競滑鼠", price: 3000, cat: "3C / 家電" },
    { id: 2, name: "旅行背包", price: 5000, cat: "衣物 / 穿搭" },
  ],
  sinkingFunds: [
    {
      id: "sf-trip",
      name: "日本旅遊",
      category: "旅遊與行程",
      targetAmount: 48000,
      monthlyContribution: 2000,
      startMonth: "2026-01",
      targetMonth: "2027-12",
      carryoverEnabled: true,
      note: "年底想出國",
      events: [{ id: "e1", type: "topup", amount: 3000, date: "2026-04-18", note: "額外補款" }],
    },
    {
      id: "sf-phone",
      name: "手機汰換",
      category: "其他支出",
      targetAmount: 36000,
      monthlyContribution: 1500,
      startMonth: "2026-03",
      targetMonth: "2027-06",
      carryoverEnabled: true,
      note: "",
      events: [],
    },
  ],
  settings: {
    budgetCap: 40000,
    catBudgets: {
      餐飲: 5000,
      其他支出: 10000,
    },
  },
};

function testOverviewAndCashFlow() {
  const overview = summarizeOverview(txs);
  assert.equal(overview.income, 41200);
  assert.equal(overview.expense, 22000);
  assert.equal(overview.net, 19200);

  const cashflow = summarizeCashFlow(txs);
  assert.equal(cashflow.operatingIncome, 40000);
  assert.equal(cashflow.operatingExpense, 22000);
  assert.equal(cashflow.investingIncome, 1200);
  assert.equal(cashflow.netOperating, 18000);
  assert.equal(cashflow.netTotal, 19200);
}

function testAccountBalances() {
  const balances = calculateAccountBalances(state);
  assert.equal(balances.cash, 14000);
  assert.equal(balances.bank, 18700);
  assert.equal(balances.card, -5000);
}

function testAdvanceReceivable() {
  const advance = txs.find((tx) => tx.type === "advance");
  assert.equal(getPersonalExpenseAmount(advance), 1000);
  assert.equal(getAdvanceRepaidAmount(txs, advance.id), 2500);
  assert.equal(getAdvanceRepaidAmount(txs, advance.id, 5), 0);
  assert.equal(getAdvanceOutstanding(txs, advance), 1500);

  const openAdvances = getOpenAdvances(txs);
  assert.equal(openAdvances.length, 1);
  assert.equal(openAdvances[0].outstandingAmount, 1500);
  assert.equal(openAdvances[0].repaidAmount, 2500);
}

function testSinkingFunds() {
  assert.equal(getFundSavedAmountAsOf(state.sinkingFunds[0], "2026-04"), 11000);
  assert.equal(getFundSavedAmountAsOf(state.sinkingFunds[1], "2026-04"), 3000);
  assert.equal(
    getFundSavedAmountAsOf(
      {
        startMonth: "2026-01",
        monthlyContribution: 2000,
        targetAmount: 30000,
        events: [{ id: "sp1", type: "spend", amount: 2500, date: "2026-03-10", linkedTxId: 99 }],
      },
      "2026-03",
    ),
    3500,
  );
}

function testBudget() {
  const budget = calculateBudgetData(state, { start: "2026-04-01", end: "2026-04-30" });
  assert.equal(budget.cap, 40000);
  assert.equal(budget.livingExpense, 22000);
  assert.equal(budget.fundContribution, 3500);
  assert.equal(budget.freeToUse, 11500);
  assert.equal(budget.manualTopups, 3000);
  assert.equal(budget.remainingAllocatable, 11500);
  assert.equal(budget.funds.length, 2);
  assert.equal(budget.funds.find((fund) => fund.id === "sf-trip").currentSaved, 11000);
  assert.equal(budget.funds.find((fund) => fund.id === "sf-trip").topupAmount, 3000);
  assert.equal(budget.categoryBudgets.find((item) => item.category === "餐飲").expense, 2000);
  assert.equal(budget.categoryBudgets.find((item) => item.category === "其他支出").expense, 20000);
  assert.equal(budget.sourceItems.length, 6);
}

function testLinkedFundExpenseCoverage() {
  const linkedState = {
    ...state,
    txs: [
      ...state.txs,
      {
        id: 99,
        type: "expense",
        amount: 20000,
        desc: "新手機",
        date: "2026-04-25",
        cat: "其他支出",
        acc: "bank",
        linkedFundId: "sf-phone",
      },
    ],
    sinkingFunds: state.sinkingFunds.map((fund) =>
      fund.id === "sf-phone"
        ? {
            ...fund,
            monthlyContribution: 7000,
            startMonth: "2026-02",
            events: [{ id: "sp-phone", type: "spend", amount: 20000, date: "2026-04-25", linkedTxId: 99 }],
          }
        : fund,
    ),
  };

  const budget = calculateBudgetData(linkedState, { start: "2026-04-01", end: "2026-04-30" });
  assert.equal(budget.livingExpense, 22000);
}

function testLinkedFundPartialCoverageUsesSpendEvent() {
  const linkedState = {
    ...state,
    txs: [
      ...state.txs,
      {
        id: 101,
        type: "expense",
        amount: 30000,
        desc: "手機實際花費",
        date: "2026-04-26",
        cat: "其他支出",
        acc: "bank",
        linkedFundId: "sf-phone",
      },
    ],
    sinkingFunds: state.sinkingFunds.map((fund) =>
      fund.id === "sf-phone"
        ? {
            ...fund,
            monthlyContribution: 10000,
            startMonth: "2026-02",
            events: [{ id: "sp-partial", type: "spend", amount: 25000, date: "2026-04-26", linkedTxId: 101 }],
          }
        : fund,
    ),
  };

  const budget = calculateBudgetData(linkedState, { start: "2026-04-01", end: "2026-04-30" });
  assert.equal(budget.livingExpense, 27000);
  assert.equal(budget.categoryBudgets.find((item) => item.category === "其他支出").expense, 25000);
}

function testAutoTopupShortfallBudgetEffect() {
  const linkedState = {
    ...state,
    txs: [
      ...state.txs,
      {
        id: 100,
        type: "expense",
        amount: 20000,
        desc: "補差額後買手機",
        date: "2026-04-25",
        cat: "其他支出",
        acc: "bank",
        linkedFundId: "sf-phone",
      },
    ],
    sinkingFunds: state.sinkingFunds.map((fund) =>
      fund.id === "sf-phone"
        ? {
            ...fund,
            monthlyContribution: 6000,
            startMonth: "2026-02",
            events: [
              { id: "tp-short", type: "topup", amount: 2000, date: "2026-04-25", linkedTxId: 100, note: "用本月可自由運用補差額" },
              { id: "sp-short", type: "spend", amount: 20000, date: "2026-04-25", linkedTxId: 100, note: "補差額後買手機" },
            ],
          }
        : fund,
    ),
  };

  const budget = calculateBudgetData(linkedState, { start: "2026-04-01", end: "2026-04-30" });
  assert.equal(budget.livingExpense, 22000);
  assert.equal(budget.manualTopups, 5000);
  assert.equal(budget.freeToUse, 5000);
}

function testDeleteLinkedFundTransactionCleansEvents() {
  const funds = withoutFundEventsLinkedToTransaction(
    [
      {
        id: "sf-phone",
        events: [
          { id: "tp-delete", type: "topup", amount: 2000, date: "2026-04-25", linkedTxId: 100 },
          { id: "sp-delete", type: "spend", amount: 20000, date: "2026-04-25", linkedTxId: 100 },
          { id: "manual", type: "topup", amount: 3000, date: "2026-04-18" },
        ],
      },
    ],
    100,
  );

  assert.deepEqual(funds[0].events, [{ id: "manual", type: "topup", amount: 3000, date: "2026-04-18" }]);
}

function testFundTargetPlanStatus() {
  const impossiblePlan = getFundTargetPlanStatus({
    targetAmount: 30000,
    monthlyContribution: 2000,
    startMonth: "2026-01",
    targetMonth: "2026-12",
  });
  assert.equal(impossiblePlan.plannedAmount, 24000);
  assert.equal(impossiblePlan.shortfall, 6000);
  assert.equal(impossiblePlan.isFeasible, false);

  const feasiblePlan = getFundTargetPlanStatus({
    targetAmount: 24000,
    monthlyContribution: 2000,
    startMonth: "2026-01",
    targetMonth: "2026-12",
  });
  assert.equal(feasiblePlan.isFeasible, true);
}

function testBalanceSheet() {
  const sheet = calculateBalanceSheet(state);
  assert.equal(sheet.receivableTotal, 1500);
  assert.equal(sheet.totalAssets, 42200);
  assert.equal(sheet.totalLiabilities, 8000);
  assert.equal(sheet.netWorth, 34200);
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
  assert.equal(getTransactionSignedAmount(advance), -1000);
}

function testMoneyNormalization() {
  assert.equal(toMoneyInt("10000"), 10000);
  assert.equal(toMoneyInt("9999.999999"), 10000);
  assert.equal(toMoneyInt("9999.999999999999"), 10000);
  assert.equal(toMoneyInt(999.9999999999999), 1000);
  assert.equal(toMoneyInt("12,345"), 12345);
  assert.equal(toMoneyInt("1000元"), 0);
  assert.equal(formatMoney(5000), "NT$ 5,000");
  assert.equal(formatMoney(-5000), "-NT$ 5,000");
  assert.equal(formatMoney("not-a-number"), "NT$ 0");
}

function testTransactionIdsAreNotDateNowOnly() {
  const tx = buildTransaction({
    txType: "expense",
    amount: "1000元",
    desc: "",
    date: "2026-04-01",
    category: "餐飲",
    accountId: "cash",
    spreadMonths: "not-a-number",
  });
  const repayment = buildAdvanceRepayment({ advanceId: "adv-1", amount: "1000元", date: "2026-04-02", accountId: "cash", person: "" });
  assert.match(tx.id, /^tx-/);
  assert.match(repayment.id, /^repay-/);
  assert.notEqual(String(tx.id), String(Date.now()));
  assert.equal(tx.amount, 0);
  assert.equal(repayment.amount, 0);
}

function testDeletedAccountFallbackKeepsHistoricalBalance() {
  const orphanState = {
    ...state,
    accounts: [{ id: "cash", name: "現金", type: "asset", initialBalance: 0 }],
    bsI: [],
    txs: [
      { id: "orphan-income", type: "income", amount: 10000, desc: "舊帳戶收入", date: "2026-04-01", cat: "薪資", acc: "deleted-bank" },
      { id: "orphan-expense", type: "expense", amount: 3000, desc: "舊帳戶支出", date: "2026-04-02", cat: "餐飲", acc: "deleted-bank" },
    ],
  };
  const balances = calculateAccountBalances(orphanState);
  const sheet = calculateBalanceSheet(orphanState);
  assert.equal(balances[DELETED_ACCOUNT_FALLBACK_ID], 7000);
  assert.equal(sheet.totalAssets, 7000);
  assert.equal(sheet.netWorth, 7000);
}

function testStateMoneyNormalization() {
  const normalized = normalizeFinanceStateMoney({
    txs: [
      { id: 1, type: "income", amount: 999.9999999999999, acc: "bank" },
      { id: 2, type: "advance", amount: 1200.0000000001, ownAmount: 399.9999999999, receivableAmount: 799.9999999999 },
    ],
    bsI: [{ id: "asset", amount: 999.9999999999999 }],
    wishes: [{ id: "wish", price: 999.9999999999999 }],
    accounts: [{ id: "bank", initialBalance: 999.9999999999999 }],
    sinkingFunds: [
      {
        id: "sf",
        targetAmount: 29999.999999999996,
        monthlyContribution: 1999.9999999999998,
        events: [{ id: "e", type: "topup", amount: 999.9999999999999 }],
      },
    ],
    settings: {
      budgetCap: 19999.999999999996,
      retManualAsset: 999.9999999999999,
      catBudgets: { 餐飲: 999.9999999999999 },
    },
  });

  assert.equal(normalized.txs[0].amount, 1000);
  assert.equal(normalized.txs[1].amount, 1200);
  assert.equal(normalized.txs[1].ownAmount, 400);
  assert.equal(normalized.txs[1].receivableAmount, 800);
  assert.equal(normalized.bsI[0].amount, 1000);
  assert.equal(normalized.wishes[0].price, 1000);
  assert.equal(normalized.accounts[0].initialBalance, 1000);
  assert.equal(normalized.sinkingFunds[0].targetAmount, 30000);
  assert.equal(normalized.sinkingFunds[0].monthlyContribution, 2000);
  assert.equal(normalized.sinkingFunds[0].events[0].amount, 1000);
  assert.equal(normalized.settings.budgetCap, 20000);
  assert.equal(normalized.settings.retManualAsset, 1000);
  assert.equal(normalized.settings.catBudgets.餐飲, 1000);
}

function testRetirementWarnings() {
  const projection = calculateRetirementProjection({
    state,
    currentAge: 30,
    retirementAge: 65,
    deathAge: 90,
    inputs: {
      currentAsset: 0,
      monthlyContribution: 0,
      principalAnnualReturnRate: 6,
      contributionAnnualReturnRate: 6,
      inflationRate: 2,
      monthlyWithdraw: 40000,
      targetAsset: 1000000,
    },
  });

  assert.equal(projection.targetTooLow, true);
  assert.ok(projection.minimumRequiredAsset > projection.targetAsset);
  assert.match(projection.depletedAgeLabel, /歲/);
}

function testRetirementKeepsZeroPercentInputs() {
  const projection = calculateRetirementProjection({
    state: {
      txs: [],
      accounts: [],
      bsI: [],
      settings: { retLinked: false },
    },
    currentAge: 30,
    retirementAge: 31,
    deathAge: 30,
    inputs: {
      currentAsset: 10000,
      monthlyContribution: 0,
      principalAnnualReturnRate: 0,
      contributionAnnualReturnRate: 0,
      inflationRate: 0,
      monthlyWithdraw: 0,
      targetAsset: 10000,
    },
  });

  assert.equal(projection.principalAnnualReturn, 0);
  assert.equal(projection.contributionAnnualReturn, 0);
  assert.equal(projection.inflation, 0);
  assert.equal(Math.round(projection.retirementValue), 10000);
}

function testRetirementViewKeepsZeroPercentInputs() {
  const node = (value = "") => ({ value, textContent: "", innerHTML: "", className: "" });
  const dom = {
    currentAge: node("30"),
    retirementAge: node("31"),
    deathAge: node("30"),
    retireAsset: node("10000"),
    retireMonthly: node("0"),
    retirePrincipalReturn: node("0"),
    retireContributionReturn: node("0"),
    retireInflation: node("0"),
    retireWithdraw: node("0"),
    retireTarget: node("10000"),
    retireLinkedValue: node(),
    retireAssetValue: node(),
    retireAssetAtRetire: node(),
    retireAchieve: node(),
    retirePaid: node(),
    retireGain: node(),
    retireSuggestion: node(),
    retireTable: node(),
  };

  renderRetirement({
    state: {
      txs: [],
      accounts: [],
      bsI: [],
      settings: { retLinked: false },
    },
    utils: { formatMoney },
    dom,
  });

  assert.equal(dom.retireAssetAtRetire.textContent, "NT$ 10,000");
}

function testBudgetViewRendering() {
  const renderingState = {
    ...state,
    txs: state.txs.map((tx) =>
      tx.id === 7
        ? {
            ...tx,
            linkedFundId: "sf-phone",
          }
        : tx,
    ),
    sinkingFunds: state.sinkingFunds.map((fund) =>
      fund.id === "sf-phone"
        ? {
            ...fund,
            targetAmount: 200000,
            monthlyContribution: 7000,
            startMonth: "2026-02",
            events: [{ id: "sp-phone", type: "spend", amount: 20000, date: "2026-04-20", linkedTxId: 7, note: "手機" }],
          }
        : fund,
    ),
  };
  const dom = {
    budgetCap: { textContent: "" },
    budgetExpense: { textContent: "" },
    budgetFundContribution: { textContent: "" },
    budgetAvailable: { textContent: "" },
    budgetPlanningRoom: { textContent: "" },
    budgetModeNote: { textContent: "" },
    leftoverNote: { textContent: "" },
    overviewFill: { style: {} },
    overviewCapLabel: { textContent: "" },
    overviewBudget: { textContent: "", className: "" },
    budgetSourceList: { innerHTML: "" },
    fundList: { innerHTML: "" },
    categoryBudgetList: { innerHTML: "" },
    wishList: { innerHTML: "" },
  };
  const utils = {
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value),
  };
  const constants = { wishCategoryIcons: { "3C / 家電": "💻", "衣物 / 穿搭": "👕" } };

  renderWishlist({
    state: renderingState,
    filterRange: { start: "2026-04-01", end: "2026-04-30" },
    constants,
    utils,
    dom,
  });

  assert.equal(dom.budgetExpense.textContent, "NT$ 2,000");
  assert.equal(dom.budgetFundContribution.textContent, "NT$ 9,000");
  assert.equal(dom.budgetAvailable.textContent, "NT$ 26,000");
  assert.equal(dom.budgetPlanningRoom.textContent, "NT$ 26,000");
  assert.match(dom.fundList.innerHTML, /日本旅遊/);
  assert.match(dom.fundList.innerHTML, /補入準備/);
  assert.match(dom.fundList.innerHTML, /動用準備/);
  assert.match(dom.fundList.innerHTML, /data-action="edit-fund"/);
  assert.match(dom.fundList.innerHTML, /對應交易：手機/);
  assert.match(dom.fundList.innerHTML, /準備事件/);
  assert.match(dom.fundList.innerHTML, /對應交易/);
  assert.match(dom.fundList.innerHTML, /原始支出 NT\$ 20,000 ｜ 準備支付 NT\$ 20,000 ｜ 本月不另外扣款/);
  assert.match(dom.fundList.innerHTML, /每月提撥到目標月份仍差/);
  assert.match(dom.budgetSourceList.innerHTML, /手動補入/);
  assert.match(dom.wishList.innerHTML, /電競滑鼠/);
  assert.match(dom.wishList.innerHTML, /data-action="edit-wish"/);
}

function testWishlistLinkedFundTransactionRendering() {
  const renderingState = {
    ...state,
    txs: [
      {
        id: 301,
        type: "expense",
        amount: 30000,
        desc: "筆電",
        date: "2026-04-21",
        cat: "其他支出",
        acc: "bank",
        linkedFundId: "sf-phone",
      },
    ],
    sinkingFunds: state.sinkingFunds.map((fund) =>
      fund.id === "sf-phone"
        ? {
            ...fund,
            events: [{ id: "sp-laptop", type: "spend", amount: 12000, date: "2026-04-21", linkedTxId: 301 }],
          }
        : fund,
    ),
  };
  const dom = {
    budgetCap: { textContent: "" },
    budgetExpense: { textContent: "" },
    budgetFundContribution: { textContent: "" },
    budgetAvailable: { textContent: "" },
    budgetPlanningRoom: { textContent: "" },
    budgetModeNote: { textContent: "" },
    leftoverNote: { textContent: "" },
    overviewFill: { style: {} },
    overviewCapLabel: { textContent: "" },
    overviewBudget: { textContent: "", className: "" },
    budgetSourceList: { innerHTML: "" },
    fundList: { innerHTML: "" },
    categoryBudgetList: { innerHTML: "" },
    wishList: { innerHTML: "" },
  };
  const utils = {
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value),
  };

  renderWishlist({
    state: renderingState,
    filterRange: { start: "2026-04-01", end: "2026-04-30" },
    constants: { wishCategoryIcons: {} },
    utils,
    dom,
  });

  assert.match(dom.fundList.innerHTML, /筆電/);
  assert.match(dom.fundList.innerHTML, /原始支出 NT\$ 30,000 ｜ 準備支付 NT\$ 12,000 ｜ 本月支出 NT\$ 18,000/);
}

function testLedgerFundTraceRendering() {
  const renderingState = {
    ...state,
    txs: [
      {
        id: 201,
        type: "expense",
        amount: 20000,
        desc: "手機",
        date: "2026-04-20",
        cat: "大型支出",
        acc: "bank",
        linkedFundId: "sf-phone",
      },
      {
        id: 202,
        type: "expense",
        amount: 30000,
        desc: "筆電",
        date: "2026-04-21",
        cat: "大型支出",
        acc: "bank",
        linkedFundId: "sf-phone",
      },
    ],
    sinkingFunds: state.sinkingFunds.map((fund) =>
      fund.id === "sf-phone"
        ? {
            ...fund,
            events: [
              { id: "sp-full", type: "spend", amount: 20000, date: "2026-04-20", linkedTxId: 201 },
              { id: "sp-partial", type: "spend", amount: 12000, date: "2026-04-21", linkedTxId: 202 },
            ],
          }
        : fund,
    ),
  };
  const dom = {
    advList: { innerHTML: "" },
    oTx: { innerHTML: "" },
    aTx: { innerHTML: "" },
    txCount: { textContent: "" },
  };
  const utils = {
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value),
  };
  const originalDocument = globalThis.document;
  globalThis.document = {
    querySelectorAll: () => [],
  };

  try {
    renderLedger({
      state: renderingState,
      filteredTxs: renderingState.txs,
      constants: {
        days: ["日", "一", "二", "三", "四", "五", "六"],
        transactionIcons: { 大型支出: "🧾" },
      },
      utils,
      dom,
    });
  } finally {
    globalThis.document = originalDocument;
  }

  assert.match(dom.aTx.innerHTML, /準備支付 NT\$ 20,000 ｜ 本月不另外扣款/);
  assert.match(dom.aTx.innerHTML, /準備支付 NT\$ 12,000 ｜ 本月支出 NT\$ 18,000/);
  assert.match(dom.aTx.innerHTML, /data-action="edit-tx"/);
}

function testBalanceSheetEditButtonsRendering() {
  const dom = { balanceSheetBody: { innerHTML: "" } };
  const utils = {
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value),
  };

  renderBalanceSheet({ state, utils, dom });
  assert.match(dom.balanceSheetBody.innerHTML, /data-action="edit-bs"/);
}

function testImportValidationRejectsUnsafeShape() {
  const validImport = {
    txs: [{ id: 1, type: "expense", amount: 1000, desc: "<script>alert(1)</script>", date: "2026-04-01", cat: "餐飲", acc: "cash" }],
    bsI: [{ id: "asset-1", name: "基金", amount: 1000, cat: "asset", isEm: false }],
    accounts: [{ id: "cash", name: "現金", type: "asset", initialBalance: 0, isEm: false }],
    wishes: [{ id: "wish-1", name: "筆電", price: 30000, cat: "3C / 家電" }],
    sinkingFunds: [
      {
        id: "sf-phone",
        name: "手機",
        category: "其他支出",
        targetAmount: 30000,
        monthlyContribution: 2000,
        startMonth: "2026-01",
        targetMonth: "2026-12",
        carryoverEnabled: true,
        note: "",
        events: [{ id: "event-1", type: "topup", amount: 1000, date: "2026-04-01", note: "補入" }],
      },
    ],
    settings: { budgetCap: 20000, catBudgets: { 餐飲: 5000 }, retManualAsset: 0 },
    userCats: { income: [], expense: ["餐飲"] },
  };

  assert.equal(isValidImportShape(validImport), true);
  assert.equal(isValidImportShape({ ...validImport, txs: [{ ...validImport.txs[0], amount: {} }] }), false);
  assert.equal(isValidImportShape({ ...validImport, txs: [{ ...validImport.txs[0], date: "not-a-date" }] }), false);
  assert.equal(isValidImportShape({ ...validImport, accounts: [{ ...validImport.accounts[0], id: 'bad" onmouseover="x' }] }), false);
  const polluted = JSON.parse(JSON.stringify(validImport).replace('"userCats":{"income":[],"expense":["餐飲"]}', '"userCats":{"income":[],"expense":[],"__proto__":{"polluted":true}}'));
  assert.equal(isValidImportShape(polluted), false);
}

function testLocalStorageLoadsValidFieldsWhenOneFieldIsBroken() {
  const values = new Map([
    ["fin_v6_txs", '[{"id":1,"type":"income","amount":1000,"desc":"薪水","date":"2026-04-01","cat":"薪資","acc":"a1"}]'],
    ["fin_v6_bsI", "{broken-json"],
    ["fin_v6_wishes", "[]"],
    ["fin_v6_funds", "[]"],
    ["fin_v6_accs", '[{"id":"a1","name":"現金","type":"asset","isEm":false,"initialBalance":0}]'],
    ["fin_v6_cats", '{"income":[],"expense":[]}'],
    ["fin_v6_set", '{"budgetCap":30000}'],
  ]);
  const originalLocalStorage = globalThis.localStorage;
  const originalWarn = console.warn;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
  };
  console.warn = () => {};

  try {
    const loaded = loadLocalState(createInitialState());
    assert.equal(loaded.txs.length, 1);
    assert.equal(loaded.txs[0].amount, 1000);
    assert.equal(loaded.bsI.length, 0);
    assert.equal(loaded.settings.budgetCap, 30000);
  } finally {
    globalThis.localStorage = originalLocalStorage;
    console.warn = originalWarn;
  }
}

function testUserControlledStringsAreEscapedInRenderedHtml() {
  const malicious = `"><img src=x onerror=alert(1)>`;
  const renderingState = {
    ...state,
    accounts: [{ id: "cash", name: malicious, type: "asset", initialBalance: 0 }],
    txs: [{ id: 401, type: "expense", amount: 1000, desc: malicious, date: "2026-04-01", cat: malicious, acc: "cash" }],
    sinkingFunds: [],
  };
  const dom = {
    advList: { innerHTML: "" },
    oTx: { innerHTML: "" },
    aTx: { innerHTML: "" },
    txCount: { textContent: "" },
  };
  const originalDocument = globalThis.document;
  globalThis.document = {
    querySelectorAll: () => [],
  };

  try {
    renderLedger({
      state: renderingState,
      filteredTxs: renderingState.txs,
      constants: { days: ["日", "一", "二", "三", "四", "五", "六"], transactionIcons: {} },
      utils: {
        formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
        escapeHTML,
      },
      dom,
    });
  } finally {
    globalThis.document = originalDocument;
  }

  assert.doesNotMatch(dom.aTx.innerHTML, /<img/i);
  assert.match(dom.aTx.innerHTML, /&lt;img/);
  assert.match(dom.aTx.innerHTML, /onerror=alert/);
}

testOverviewAndCashFlow();
testAccountBalances();
testAdvanceReceivable();
testSinkingFunds();
testBudget();
testLinkedFundExpenseCoverage();
testLinkedFundPartialCoverageUsesSpendEvent();
testAutoTopupShortfallBudgetEffect();
testDeleteLinkedFundTransactionCleansEvents();
testFundTargetPlanStatus();
testBalanceSheet();
testTraceabilityHelpers();
testMoneyNormalization();
testTransactionIdsAreNotDateNowOnly();
testDeletedAccountFallbackKeepsHistoricalBalance();
testStateMoneyNormalization();
testRetirementWarnings();
testRetirementKeepsZeroPercentInputs();
testRetirementViewKeepsZeroPercentInputs();
testBudgetViewRendering();
testWishlistLinkedFundTransactionRendering();
testLedgerFundTraceRendering();
testBalanceSheetEditButtonsRendering();
testImportValidationRejectsUnsafeShape();
testLocalStorageLoadsValidFieldsWhenOneFieldIsBroken();
testUserControlledStringsAreEscapedInRenderedHtml();

console.log("Domain tests passed");
