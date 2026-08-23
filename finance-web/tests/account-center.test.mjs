import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccountCenterController } from "../src/app/controllers/account-center-controller.js";
import { calculateAccountBalances } from "../src/domain/accounts.js";
import { calculateAccountCenter, getCreditCardSchedule } from "../src/domain/account-center.js";
import { summarizeOverview } from "../src/domain/transactions.js";
import { createStore } from "../src/state/store.js";

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
  assert.equal(card.schedule.nextPaymentDueDate, "2026-09-23");
  assert.equal(getCreditCardSchedule({}, new Date(2026, 7, 23)), null);
  const bank = data.accounts.find((item) => item.id === "bank");
  assert.equal(bank.monthInflow, 0);
  assert.equal(bank.monthOutflow, 300);
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
