import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccountCenterController } from "../src/app/controllers/account-center-controller.js";
import { calculateAccountBalances } from "../src/domain/accounts.js";
import { calculateBalanceSheet } from "../src/domain/accounts.js";
import { calculateAccountCenter, getCreditCardSchedule } from "../src/domain/account-center.js";
import { summarizeOverview } from "../src/domain/transactions.js";
import { createStore } from "../src/state/store.js";
import { renderBalanceSheet } from "../src/views/balance-sheet-view.js";

function sampleState() {
  return {
    accounts: [
      { id: "bank", name: "銀行", type: "asset", initialBalance: 10000, isEm: false },
      { id: "card", name: "信用卡", type: "liability", initialBalance: 0, creditLimit: 10000, statementDay: 5, paymentDueDay: 23, isEm: false },
    ],
    txs: [
      { id: "old", type: "expense", amount: 500, date: "2026-08-04", acc: "card", category: "餐飲", cat: "餐飲" },
      { id: "charge", type: "expense", amount: 1000, date: "2026-08-06", acc: "card", category: "費用", cat: "費用" },
      { id: "pay", type: "transfer", amount: 300, date: "2026-08-10", fromAcc: "bank", toAcc: "card", category: "轉帳", cat: "轉帳" },
    ],
    bsI: [], wishes: [], sinkingFunds: [], userCats: { income: [], expense: [] }, settings: {},
  };
}

test("credit-card center derives debt, available credit, billing charges, and payments", () => {
  const data = calculateAccountCenter(sampleState(), new Date(2026, 7, 23, 18, 30));
  const card = data.accounts.find((item) => item.id === "card");
  assert.equal(card.balance, -1200);
  assert.equal(card.debt, 1200);
  assert.equal(card.availableCredit, 8800);
  assert.equal(card.periodCharges, 1000);
  assert.equal(card.periodPayments, 300);
  assert.equal(card.schedule.periodStart, "2026-08-06");
  assert.equal(card.schedule.nextStatementDate, "2026-09-05");
  assert.equal(card.schedule.nextPaymentDueDate, "2026-08-23");
  assert.equal(getCreditCardSchedule({}, new Date(2026, 7, 23)), null);
  const bank = data.accounts.find((item) => item.id === "bank");
  assert.equal(bank.monthInflow, 0);
  assert.equal(bank.monthOutflow, 300);
});

test("removed accounts disappear from daily cards but their balances remain traceable in totals", () => {
  const state = sampleState();
  const before = calculateBalanceSheet(state);
  state.accounts[1].enabled = false;
  assert.deepEqual(calculateBalanceSheet(state), before);
  assert.deepEqual(calculateAccountCenter(state).accounts.map((account) => account.id), ["bank"]);
  const utils = { escapeHTML: (value) => String(value), formatMoney: (value) => String(value) };
  const dom = { balanceSheetBody: {}, accountCenter: {} };
  renderBalanceSheet({ state, utils, dom });
  assert.match(dom.balanceSheetBody.innerHTML, /已移除帳戶餘額（仍計入總額）/);
  assert.match(dom.balanceSheetBody.innerHTML, /信用卡（已移除）/);
  assert.match(dom.balanceSheetBody.innerHTML, /-1200/);
  assert.doesNotMatch(dom.accountCenter.innerHTML, /信用卡/);
});

test("credit-card unset days never become the first day and partial settings stay independent", () => {
  const today = new Date(2026, 8, 20, 23, 59);
  for (const value of [undefined, null, "", " ", 0, "0", -1, 32, NaN]) {
    assert.equal(getCreditCardSchedule({ statementDay: value, paymentDueDay: value }, today), null);
  }
  assert.deepEqual(getCreditCardSchedule({ statementDay: 0, paymentDueDay: 23 }, today), {
    periodStart: "", periodEnd: "", nextStatementDate: "", nextPaymentDueDate: "2026-09-23",
  });
  assert.deepEqual(getCreditCardSchedule({ statementDay: 5, paymentDueDay: 0 }, today), {
    periodStart: "2026-09-06", periodEnd: "2026-10-05", nextStatementDate: "2026-10-05", nextPaymentDueDate: "",
  });
  const state = sampleState();
  state.accounts[1].statementDay = 0;
  const card = calculateAccountCenter(state, today).accounts[1];
  assert.equal(card.schedule.nextPaymentDueDate, "2026-09-23");
  assert.equal(card.periodCharges, 0);
  assert.equal(card.periodPayments, 0);
});

test("nearest scheduled payment includes today and crosses months or years without using the next statement", () => {
  const cases = [
    [new Date(2026, 8, 20), 5, 23, "2026-09-23"],
    [new Date(2026, 8, 23, 23, 59, 59), 5, 23, "2026-09-23"],
    [new Date(2026, 8, 24), 5, 23, "2026-10-23"],
    [new Date(2026, 8, 24), 5, 24, "2026-09-24"],
    [new Date(2026, 3, 29), 31, 31, "2026-04-30"],
    [new Date(2026, 3, 30), 31, 31, "2026-04-30"],
    [new Date(2026, 4, 1), 31, 31, "2026-05-31"],
    [new Date(2026, 1, 27), 30, 30, "2026-02-28"],
    [new Date(2028, 1, 28), 31, 31, "2028-02-29"],
    [new Date(2028, 1, 29), 31, 31, "2028-02-29"],
    [new Date(2026, 11, 31), 31, 31, "2026-12-31"],
    [new Date(2027, 0, 1), 31, 31, "2027-01-31"],
    [new Date(2026, 11, 29), 5, 23, "2027-01-23"],
    [new Date(2026, 11, 31), 28, 1, "2027-01-01"],
    [new Date(2026, 1, 28, 18), 28, 28, "2026-02-28"],
    [new Date(2026, 1, 28), 23, 5, "2026-03-05"],
  ];
  for (const [today, statementDay, paymentDueDay, expected] of cases) {
    assert.equal(getCreditCardSchedule({ statementDay, paymentDueDay }, today).nextPaymentDueDate, expected);
  }
});

test("month-end statement cycles use the actual last day and do not skip February", () => {
  assert.deepEqual(getCreditCardSchedule({ statementDay: 31, paymentDueDay: 30 }, new Date(2026, 1, 27)), {
    periodStart: "2026-02-01", periodEnd: "2026-02-28", nextStatementDate: "2026-02-28", nextPaymentDueDate: "2026-02-28",
  });
  assert.deepEqual(getCreditCardSchedule({ statementDay: 31, paymentDueDay: 30 }, new Date(2026, 1, 28)), {
    periodStart: "2026-03-01", periodEnd: "2026-03-31", nextStatementDate: "2026-03-31", nextPaymentDueDate: "2026-02-28",
  });
});

test("credit-card view labels missing days and calendar-only reminder without inventing billing totals", () => {
  const state = sampleState();
  const utils = { escapeHTML: (value) => String(value), formatMoney: (value) => String(value) };
  const renderCard = (statementDay, paymentDueDay) => {
    Object.assign(state.accounts[1], { statementDay, paymentDueDay });
    const dom = { balanceSheetBody: {}, accountCenter: {} };
    renderBalanceSheet({ state, utils, dom });
    return dom.accountCenter.innerHTML;
  };
  const noDates = renderCard(0, 0);
  assert.match(noDates, /結帳日：未設定/);
  assert.match(noDates, /最近預定繳款日：未設定/);
  assert.match(noDates, /29～31 日遇較短月份以月底推算；不代表銀行實際帳單或尚未繳清/);
  const dueOnly = renderCard(0, 23);
  assert.match(dueOnly, /本期新增刷卡<\/span><strong>設定結帳日後顯示/);
  assert.match(dueOnly, /最近預定繳款日：\d{4}-\d{2}-23/);
  assert.match(renderCard(5, 0), /最近預定繳款日：未設定/);
});

test("confirmed reconciliation creates one traceable adjustment without changing reports", () => {
  const store = createStore(sampleState());
  const input = { value: "-1000", dataset: { reconcileInput: "card" } };
  const calls = { confirm: 0, render: 0, toast: [] };
  const controller = createAccountCenterController({
    root: { querySelectorAll: () => [input] },
    store,
    toast: { show: (...args) => calls.toast.push(args) },
    commitState: (mutator, { updateUi }) => { store.update(mutator); updateUi(); },
    renderAll: () => { calls.render += 1; },
    localDateStr: () => "2026-08-23",
    confirmAdjustment: () => { calls.confirm += 1; return true; },
  });
  const beforeOverview = summarizeOverview(store.getState().txs);

  assert.equal(controller.reconcile("card"), true);
  const adjustment = store.getState().txs.at(-1);
  assert.equal(adjustment.type, "balance_adjustment");
  assert.equal(adjustment.direction, "increase");
  assert.equal(adjustment.amount, 200);
  assert.equal(calculateAccountBalances(store.getState()).card, -1000);
  assert.deepEqual(summarizeOverview(store.getState().txs), beforeOverview);
  assert.equal(calls.confirm, 1);
  assert.equal(calls.render, 1);
});

test("matching or cancelled reconciliation does not create an adjustment", () => {
  const store = createStore(sampleState());
  const input = { value: "-1200", dataset: { reconcileInput: "card" } };
  const controller = createAccountCenterController({
    root: { querySelectorAll: () => [input] },
    store,
    toast: { show() {} },
    commitState: () => { throw new Error("must-not-commit"); },
    renderAll: () => {},
    localDateStr: () => "2026-08-23",
    confirmAdjustment: () => false,
  });
  assert.equal(controller.reconcile("card"), true);
  input.value = "-1100";
  assert.equal(controller.reconcile("card"), false);
  assert.equal(store.getState().txs.length, 3);
});
