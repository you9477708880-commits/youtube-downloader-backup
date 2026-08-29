import assert from "node:assert/strict";

import { DELETED_ACCOUNT_FALLBACK_ID, calculateAccountBalances, calculateBalanceSheet } from "../src/domain/accounts.js";
import { calculateBudgetData } from "../src/domain/budget.js";
import { getUnusedCategoryBudgetNames } from "../src/domain/category-budgets.js";
import { calculateMonthlyReviewData } from "../src/domain/monthly-review.js";
import { calculateRetirementProjection } from "../src/domain/retirement.js";
import { createSinkingFundController } from "../src/app/controllers/sinking-fund-controller.js";
import { createWishlistController } from "../src/app/controllers/wishlist-controller.js";
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
import { renderOverview } from "../src/views/overview-view.js";
import { renderMonthlyReview } from "../src/views/monthly-review-view.js";
import { renderCashFlow } from "../src/views/cashflow-view.js";
import { renderLedger } from "../src/views/ledger-view.js";
import { renderWishlist } from "../src/views/wishlist-view.js";
import { renderBalanceSheet } from "../src/views/balance-sheet-view.js";
import { renderRetirement } from "../src/views/retirement-view.js";
import { buildAndroMoneyCsv, parseAndroMoneyCsv } from "../src/services/andromoney-csv.js";
import { isValidImportShape } from "../src/services/import-export.js";
import { loadLocalState } from "../src/services/storage-local.js";
import { areFinanceStatesEquivalent, hasMeaningfulFinanceData } from "../src/services/sync-policy.js";
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

function testCashFlowIncludesCustomIncomeCategories() {
  const cashflow = summarizeCashFlow([
    { id: "custom-income", type: "income", amount: 3000, desc: "網拍", date: "2026-04-07", cat: "網拍收入", acc: "bank" },
    { id: "dividend", type: "income", amount: 1200, desc: "股息", date: "2026-04-08", cat: "股息收入", acc: "bank" },
    { id: "meal", type: "expense", amount: 500, desc: "晚餐", date: "2026-04-09", cat: "餐飲", acc: "cash" },
  ]);

  assert.equal(cashflow.operatingIncome, 3000);
  assert.equal(cashflow.investingIncome, 1200);
  assert.equal(cashflow.operatingExpense, 500);
  assert.equal(cashflow.netOperating, 2500);
  assert.equal(cashflow.netTotal, 3700);
}

function testAccountBalances() {
  const balances = calculateAccountBalances(state);
  assert.equal(balances.cash, 14000);
  assert.equal(balances.bank, 18700);
  assert.equal(balances.card, -5000);

  const numericLegacyBalances = calculateAccountBalances({
    accounts: [{ id: 0, name: "舊現金", type: "asset", initialBalance: 100 }],
    txs: [{ id: "legacy-zero", type: "expense", amount: 40, date: "2026-04-01", acc: 0 }],
  });
  assert.equal(numericLegacyBalances[0], 60);
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

function testUnusedCategoryBudgetDetection() {
  const unused = getUnusedCategoryBudgetNames(
    {
      txs: [
        { id: "tx-custom", type: "expense", amount: 1000, category: "歷史自訂", cat: "歷史自訂", subcategory: "未分類" },
        { id: "tx-income", type: "income", amount: 2000, category: "不存在收入", cat: "不存在收入" },
      ],
      userCats: { income: [], expense: ["仍在自訂"] },
      settings: {
        catBudgets: {
          餐飲: 5000,
          歷史自訂: 3000,
          仍在自訂: 2000,
          孤立分類: 1000,
        },
      },
    },
    { expenseCategories: ["餐飲"] },
  );

  assert.deepEqual(unused, ["孤立分類"]);
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

function testMonthlyReviewUsesBudgetLivingExpenseForFundCoverage() {
  const linkedState = {
    ...state,
    txs: [
      ...state.txs,
      {
        id: 101,
        type: "expense",
        amount: 30000,
        desc: "Phone purchase",
        date: "2026-04-26",
        cat: "Large expense",
        category: "Large expense",
        subcategory: "Phone",
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

  const review = calculateMonthlyReviewData(linkedState, { start: "2026-04-01", end: "2026-04-30" });
  assert.equal(review.income, 41200);
  assert.equal(review.ledgerExpense, 52000);
  assert.equal(review.budget.livingExpense, 27000);
  assert.equal(review.funds.spend, 25000);
  assert.equal(review.budget.budgetShortfall, 2000);
  assert.ok(review.budgetUseItems.some((item) => item.title === "Phone purchase" && item.amount === 5000));
  assert.ok(review.budgetUseItems.some((item) => item.type === "fund-plan" && item.amount === 10000));
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

function testCategorySchemaMigration() {
  const normalized = normalizeFinanceStateMoney({
    txs: [
      { id: 1, type: "expense", amount: 1000, desc: "舊資料", date: "2026-04-01", cat: "餐飲", acc: "cash" },
      { id: 2, type: "income", amount: 2000, desc: "新資料", date: "2026-04-02", category: "副業收入", subcategory: "網拍", acc: "bank" },
      { id: 3, type: "expense", amount: 3000, desc: "缺分類", date: "2026-04-03", acc: "cash" },
    ],
    bsI: [],
    wishes: [],
    accounts: [],
    sinkingFunds: [],
    settings: {},
  });

  assert.equal(normalized.schemaVersion, 3);
  assert.equal(normalized.txs[0].category, "餐飲");
  assert.equal(normalized.txs[0].subcategory, "未分類");
  assert.equal(normalized.txs[0].cat, "餐飲");
  assert.equal(normalized.txs[1].category, "副業收入");
  assert.equal(normalized.txs[1].subcategory, "網拍");
  assert.equal(normalized.txs[1].cat, "副業收入");
  assert.equal(normalized.txs[2].category, "未分類");
  assert.equal(normalized.txs[2].subcategory, "未分類");

  const tx = buildTransaction({
    txType: "expense",
    amount: "1000",
    desc: "新交易",
    date: "2026-04-04",
    category: "購物",
    subcategory: "3C",
    accountId: "cash",
  });
  assert.equal(tx.category, "購物");
  assert.equal(tx.subcategory, "3C");
  assert.equal(tx.cat, "購物");
}

function testAndroMoneyCsvConversionPreservesTwoCategoryLevels() {
  const csv = [
    '"Google Documents","理財幫手AndroMoney","20260518"',
    '"Id","幣別","金額","分類","子分類","日期","付款(轉出)","收款(轉入)","備註","Periodic","專案","商家(公司)","uid","時間"',
    '"6542","TWD","209","餐飲食品","午餐","20251103","  台新銀行  ","","波奇波奇","","","","uid-meal","1202"',
    '"6543","TWD","1000","一般收入","其他","20251104","","台新銀行","政府普發","","","","uid-income","1020"',
    '"6544","TWD","3000","帳目整理","帳目整理","20251105","現金","台新銀行","轉入銀行","","","","uid-transfer","1538"',
  ].join("\n");

  const parsed = parseAndroMoneyCsv(csv, { accountMap: { 台新銀行: "bank", 現金: "cash" } });
  assert.deepEqual(parsed.accountNames, ["台新銀行", "現金"]);
  assert.deepEqual(parsed.unmappedAccounts, []);
  assert.equal(parsed.transactions.length, 3);
  assert.equal(parsed.transactions[0].type, "expense");
  assert.equal(parsed.transactions[0].category, "餐飲食品");
  assert.equal(parsed.transactions[0].subcategory, "午餐");
  assert.equal(parsed.transactions[0].acc, "bank");
  assert.equal(parsed.transactions[0].externalSource, "andromoney");
  assert.equal(parsed.transactions[0].externalId, "6542");
  assert.equal(parsed.transactions[1].type, "income");
  assert.equal(parsed.transactions[1].acc, "bank");
  assert.equal(parsed.transactions[2].type, "transfer");
  assert.equal(parsed.transactions[2].category, "帳目整理");
  assert.equal(parsed.transactions[2].subcategory, "帳目整理");
  assert.equal(parsed.transactions[2].fromAcc, "cash");
  assert.equal(parsed.transactions[2].toAcc, "bank");

  const exported = buildAndroMoneyCsv(parsed.transactions, accounts, { includeBom: false, generatedDate: new Date(2026, 4, 20) });
  assert.match(exported, /^"Google Documents","理財幫手AndroMoney","20260520"/);
  assert.match(exported, /"餐飲食品","午餐","20251103","銀行",""/);
  assert.match(exported, /"一般收入","其他","20251104","","銀行"/);
}

function testAndroMoneyAccountNamesDoNotReadInheritedObjectProperties() {
  const csv = [
    '"Google Documents","理財幫手AndroMoney","20260518"',
    '"Id","幣別","金額","分類","子分類","日期","付款(轉出)","收款(轉入)","備註","Periodic","專案","商家(公司)","uid","時間"',
    '"safe-1","TWD","100","費用","測試","20260518","constructor","","安全測試","","","","",""',
  ].join("\n");

  const unmapped = parseAndroMoneyCsv(csv);
  assert.deepEqual(unmapped.unmappedAccounts, ["constructor"]);
  assert.equal(unmapped.transactions[0].acc, "");

  const mapped = parseAndroMoneyCsv(csv, {
    accountMap: Object.fromEntries([["constructor", "safe-account-id"]]),
  });
  assert.deepEqual(mapped.unmappedAccounts, []);
  assert.equal(mapped.transactions[0].acc, "safe-account-id");

  const caseCsv = [
    '"Google Documents","理財幫手AndroMoney","20260518"',
    '"Id","幣別","金額","分類","子分類","日期","付款(轉出)","收款(轉入)","備註","Periodic","專案","商家(公司)","uid","時間"',
    '"case-1","TWD","100","費用","測試","20260518","VISA","","大寫","","","","",""',
    '"case-2","TWD","200","費用","測試","20260519","visa","","小寫","","","","",""',
  ].join("\n");
  const caseParsed = parseAndroMoneyCsv(caseCsv, { accountMap: { VISA: "visa-account" } });
  assert.deepEqual(caseParsed.accountNames, ["VISA"]);
  assert.deepEqual(caseParsed.unmappedAccounts, []);
  assert.ok(caseParsed.transactions.every((transaction) => transaction.acc === "visa-account"));
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
    lifeRoutines: [{ id: "routine-1", name: "半年洗牙", query: "洗牙", expectedIntervalDays: 180, dueSoonDays: 14, enabled: true }],
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

function testWishActionsAcceptRenderedStringIds() {
  const actionState = {
    txs: [],
    sinkingFunds: [],
    wishes: [
      { id: "wish-alpha", name: "A", price: 100, cat: "其他" },
      { id: 901, name: "B", price: 200, cat: "其他" },
      { id: "wish-omega", name: "C", price: 300, cat: "其他" },
    ],
  };
  let renderCount = 0;
  let saved = false;
  const dom = {
    wishName: { value: "" },
    wishPrice: { value: "" },
    wishCategory: { value: "" },
    root: { getElementById: () => ({ scrollIntoView: () => {} }) },
  };
  const ui = {
    toast: { show: () => {} },
    setWishEditMode: () => {},
    setActiveTab: () => {},
    populateCategoryBudgetOptions: () => {},
    renderTransactionCategorySelect: () => {},
    populateFundOptions: () => {},
  };
  const store = {
    getState: () => actionState,
    update: (updater) => updater(actionState),
  };
  const controller = createWishlistController({
    elements: {
      root: dom.root,
      name: dom.wishName,
      price: dom.wishPrice,
      category: dom.wishCategory,
    },
    store,
    toast: ui.toast,
    setEditMode: ui.setWishEditMode,
    renderWishlist: () => {
      renderCount += 1;
    },
    commitState: (mutator, { updateUi }) => {
      store.update(mutator);
      saved = true;
      updateUi(actionState);
    },
    navigate: ui.setActiveTab,
  });

  controller.mvWish("wish-omega", -1);
  assert.deepEqual(actionState.wishes.map((wish) => wish.id), ["wish-alpha", "wish-omega", 901]);

  controller.mvWish("901", -1);
  assert.deepEqual(actionState.wishes.map((wish) => wish.id), ["wish-alpha", 901, "wish-omega"]);

  controller.beginEditWish("wish-alpha");
  assert.equal(dom.wishName.value, "A");

  controller.delWish("wish-alpha");
  assert.deepEqual(actionState.wishes.map((wish) => wish.id), [901, "wish-omega"]);
  assert.equal(saved, true);
  assert.equal(renderCount, 3);
}

function testWishCanPrefillFundFormWithoutMutatingState() {
  const actionState = {
    txs: [],
    sinkingFunds: [],
    wishes: [{ id: "wish-camera", name: "Camera", price: 18000, cat: "擗ㄡ" }],
  };
  let saved = false;
  let renderAllCount = 0;
  const scrollTarget = { scrollIntoView: () => {} };
  const dom = {
    fundName: { value: "" },
    fundTarget: { value: "" },
    fundMonthly: { value: "" },
    fundStart: { value: "2026-05" },
    fundTargetMonth: { value: "2026-12" },
    fundNote: { value: "" },
    fundCarry: { checked: false },
    fundCategory: {
      value: "",
      options: [{ value: "擗ㄡ", textContent: "擗ㄡ" }],
    },
    root: { getElementById: (id) => (id === "form-fund" ? scrollTarget : null) },
  };
  const ui = {
    toast: { show: () => {} },
    setFundEditMode: () => {},
    setActiveTab: () => {},
    populateCategoryBudgetOptions: () => {},
    populateFundOptions: () => {},
  };
  const store = {
    getState: () => actionState,
    update: (updater) => updater(actionState),
  };
  const controller = createSinkingFundController({
    elements: {
      root: dom.root,
      name: dom.fundName,
      category: dom.fundCategory,
      target: dom.fundTarget,
      monthly: dom.fundMonthly,
      start: dom.fundStart,
      targetMonth: dom.fundTargetMonth,
      note: dom.fundNote,
      carry: dom.fundCarry,
    },
    store,
    toast: ui.toast,
    setEditMode: ui.setFundEditMode,
    navigate: () => { renderAllCount += 1; },
    populateFundOptions: ui.populateFundOptions,
    renderWishlist: () => {},
    commitState: () => {
      saved = true;
    },
  });

  controller.prepareFundFromWish("wish-camera");

  assert.equal(dom.fundName.value, "Camera");
  assert.equal(dom.fundTarget.value, 18000);
  assert.equal(dom.fundMonthly.value, 18000);
  assert.equal(dom.fundStart.value, "2026-05");
  assert.equal(dom.fundTargetMonth.value, "");
  assert.equal(dom.fundCarry.checked, true);
  assert.equal(dom.fundCategory.value, "擗ㄡ");
  assert.match(dom.fundNote.value, /Camera/);
  assert.equal(actionState.sinkingFunds.length, 0);
  assert.equal(actionState.wishes.length, 1);
  assert.equal(saved, false);
  assert.equal(renderAllCount, 1);
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
  assert.match(dom.aTx.innerHTML, /data-action="view-tx"/);
}

function testBalanceSheetEditButtonsRendering() {
  const dom = { balanceSheetBody: { innerHTML: "" }, accountCenter: { innerHTML: "" } };
  const utils = {
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value),
  };

  renderBalanceSheet({ state, utils, dom });
  assert.match(dom.accountCenter.innerHTML, /data-action="edit-bs"/);
  assert.match(dom.accountCenter.innerHTML, /data-action="reconcile-account"/);
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
    lifeRoutines: [{ id: "routine-1", name: "半年洗牙", query: "洗牙", expectedIntervalDays: 180, dueSoonDays: 14, enabled: true }],
    settings: { budgetCap: 20000, catBudgets: { 餐飲: 5000 }, retManualAsset: 0 },
    userCats: { income: [], expense: ["餐飲"] },
  };

  assert.equal(isValidImportShape(validImport), true);
  assert.equal(isValidImportShape({
    ...validImport,
    txs: [{ id: "adj-1", type: "balance_adjustment", amount: 250, date: "2026-04-01", acc: "cash", direction: "increase", desc: "帳戶對帳調整" }],
    accounts: [{ ...validImport.accounts[0], creditLimit: 50000, statementDay: 5, paymentDueDay: 23 }],
  }), true);
  assert.equal(isValidImportShape({ ...validImport, txs: [{ id: "adj-bad", type: "balance_adjustment", amount: 250, date: "2026-04-01", acc: "cash", direction: "sideways" }] }), false);
  assert.equal(isValidImportShape({ ...validImport, accounts: [{ ...validImport.accounts[0], statementDay: 31 }] }), false);
  assert.equal(isValidImportShape({ ...validImport, txs: [{ ...validImport.txs[0], amount: {} }] }), false);
  assert.equal(isValidImportShape({ ...validImport, txs: [{ ...validImport.txs[0], date: "not-a-date" }] }), false);
  assert.equal(isValidImportShape({ ...validImport, accounts: [{ ...validImport.accounts[0], id: 'bad" onmouseover="x' }] }), false);
  assert.equal(isValidImportShape({ ...validImport, lifeRoutines: [{ ...validImport.lifeRoutines[0], dueSoonDays: 366 }] }), false);
  assert.equal(isValidImportShape({ ...validImport, lifeRoutines: [{ ...validImport.lifeRoutines[0], query: "" }] }), false);
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
    accounts: [{ id: "cash", name: malicious, type: "asset", initialBalance: 0, isEm: false }],
    txs: [{ id: 401, type: "expense", amount: 1000, desc: malicious, date: "2026-04-01", cat: malicious, category: malicious, subcategory: malicious, acc: "cash" }],
    bsI: [{ id: malicious, name: malicious, amount: 500, cat: "asset", isEm: false }],
    wishes: [{ id: malicious, name: malicious, price: 300, cat: malicious }],
    sinkingFunds: [
      {
        id: malicious,
        name: malicious,
        category: malicious,
        targetAmount: 1000,
        monthlyContribution: 100,
        startMonth: "2026-04",
        targetMonth: "2026-12",
        carryoverEnabled: true,
        note: malicious,
        events: [{ id: "event-malicious", type: "topup", amount: 100, date: "2026-04-02", note: malicious }],
      },
    ],
    settings: {
      ...state.settings,
      catBudgets: { [malicious]: 2000 },
    },
  };
  const ledgerDom = {
    advList: { innerHTML: "" },
    oTx: { innerHTML: "" },
    aTx: { innerHTML: "" },
    txCount: { textContent: "" },
  };
  const overviewDom = {
    oIncome: { textContent: "" },
    oExpense: { textContent: "" },
    oNet: { textContent: "", className: "" },
    oBars: { innerHTML: "" },
    monthlyReview: { innerHTML: "" },
  };
  const cashflowDom = { cashflowBody: { innerHTML: "" } };
  const balanceDom = { balanceSheetBody: { innerHTML: "" }, accountCenter: { innerHTML: "" } };
  const wishlistDom = {
    budgetCap: { textContent: "" },
    budgetExpense: { textContent: "" },
    budgetFundContribution: { textContent: "" },
    budgetAvailable: { textContent: "" },
    budgetPlanningRoom: { textContent: "" },
    overviewFill: { style: { width: "" } },
    overviewCapLabel: { textContent: "" },
    overviewBudget: { textContent: "" },
    budgetModeNote: { textContent: "" },
    budgetSourceList: { innerHTML: "" },
    leftoverNote: { textContent: "" },
    categoryBudgetList: { innerHTML: "" },
    fundList: { innerHTML: "" },
    wishList: { innerHTML: "" },
  };
  const renderUtils = {
    formatMoney,
    escapeHTML,
    localDateStr: () => "2026-04-01",
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
      utils: renderUtils,
      dom: ledgerDom,
    });
  } finally {
    globalThis.document = originalDocument;
  }

  renderOverview({
    state: renderingState,
    filteredTxs: renderingState.txs,
    constants: { expenseColors: ["#000"] },
    utils: renderUtils,
    dom: overviewDom,
  });
  renderMonthlyReview({
    state: renderingState,
    filterRange: { start: "2026-04-01", end: "2026-04-30" },
    utils: renderUtils,
    dom: overviewDom,
  });
  renderCashFlow({ filteredTxs: renderingState.txs, utils: renderUtils, dom: cashflowDom, state: renderingState });
  renderBalanceSheet({ state: renderingState, utils: renderUtils, dom: balanceDom });
  renderWishlist({
    state: renderingState,
    filterRange: { start: "2026-04-01", end: "2026-04-30" },
    constants: { wishCategoryIcons: {} },
    utils: renderUtils,
    dom: wishlistDom,
  });

  const html = [
    ledgerDom.aTx.innerHTML,
    overviewDom.oBars.innerHTML,
    overviewDom.monthlyReview.innerHTML,
    cashflowDom.cashflowBody.innerHTML,
    balanceDom.balanceSheetBody.innerHTML,
    balanceDom.accountCenter.innerHTML,
    wishlistDom.budgetSourceList.innerHTML,
    wishlistDom.categoryBudgetList.innerHTML,
    wishlistDom.fundList.innerHTML,
    wishlistDom.wishList.innerHTML,
  ].join("\n");

  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /onerror=alert\(1\)>/i);
  assert.match(html, /&lt;img/);
  assert.match(overviewDom.monthlyReview.innerHTML, /主要預算使用來源/);
  assert.match(overviewDom.monthlyReview.innerHTML, /data-action="view-tx"/);
  assert.match(overviewDom.monthlyReview.innerHTML, /data-action="view-budget-source"/);
}

function testCloudSyncPolicyDetectsMeaningfulAndEquivalentData() {
  const empty = createInitialState();
  const local = createInitialState();
  local.txs = [
    {
      id: "tx-sync-local",
      type: "expense",
      amount: 1000,
      desc: "本機晚餐",
      date: "2026-05-01",
      cat: "餐飲食品",
      category: "餐飲食品",
      subcategory: "晚餐",
      acc: "cash",
    },
  ];
  const sameRemote = {
    txs: [{ ...local.txs[0], amount: "1000" }],
  };
  const differentRemote = {
    txs: [{ ...local.txs[0], amount: 1200 }],
  };
  const reorderedRemote = {
    settings: Object.fromEntries(Object.entries(local.settings).reverse()),
    userCats: { expense: [], income: [] },
    accounts: local.accounts.map((account) => Object.fromEntries(Object.entries(account).reverse())),
    sinkingFunds: [],
    wishes: [],
    bsI: [],
    txs: [Object.fromEntries(Object.entries(local.txs[0]).reverse())],
    schemaVersion: local.schemaVersion,
  };

  assert.equal(hasMeaningfulFinanceData(empty), false);
  assert.equal(hasMeaningfulFinanceData(local), true);
  assert.equal(areFinanceStatesEquivalent(local, sameRemote), true);
  assert.equal(areFinanceStatesEquivalent(local, reorderedRemote), true);
  assert.equal(areFinanceStatesEquivalent(local, differentRemote), false);
}

testOverviewAndCashFlow();
testCashFlowIncludesCustomIncomeCategories();
testAccountBalances();
testAdvanceReceivable();
testSinkingFunds();
testBudget();
testUnusedCategoryBudgetDetection();
testLinkedFundExpenseCoverage();
testLinkedFundPartialCoverageUsesSpendEvent();
testMonthlyReviewUsesBudgetLivingExpenseForFundCoverage();
testAutoTopupShortfallBudgetEffect();
testDeleteLinkedFundTransactionCleansEvents();
testFundTargetPlanStatus();
testBalanceSheet();
testTraceabilityHelpers();
testMoneyNormalization();
testCategorySchemaMigration();
testAndroMoneyCsvConversionPreservesTwoCategoryLevels();
testAndroMoneyAccountNamesDoNotReadInheritedObjectProperties();
testTransactionIdsAreNotDateNowOnly();
testDeletedAccountFallbackKeepsHistoricalBalance();
testStateMoneyNormalization();
testRetirementWarnings();
testRetirementKeepsZeroPercentInputs();
testRetirementViewKeepsZeroPercentInputs();
testBudgetViewRendering();
testWishlistLinkedFundTransactionRendering();
testWishActionsAcceptRenderedStringIds();
testWishCanPrefillFundFormWithoutMutatingState();
testLedgerFundTraceRendering();
testBalanceSheetEditButtonsRendering();
testImportValidationRejectsUnsafeShape();
testLocalStorageLoadsValidFieldsWhenOneFieldIsBroken();
testUserControlledStringsAreEscapedInRenderedHtml();
testCloudSyncPolicyDetectsMeaningfulAndEquivalentData();

console.log("Domain tests passed");
