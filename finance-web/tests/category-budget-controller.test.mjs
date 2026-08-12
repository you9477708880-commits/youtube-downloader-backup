import assert from "node:assert/strict";
import { test } from "node:test";
import { createCategoryBudgetController } from "../src/app/controllers/category-budget-controller.js";
import { createStore } from "../src/state/store.js";

function createHarness() {
  const store = createStore({
    txs: [
      { id: "expense-1", type: "expense", amount: 100, category: "歷史支出" },
      { id: "advance-1", type: "advance", amount: 500, ownAmount: 50, cat: "歷史代墊" },
      { id: "advance-2", type: "advance", amount: 500, ownAmount: 0, category: "零額代墊" },
      { id: "transfer-1", type: "transfer", amount: 100, category: "轉帳分類" },
    ],
    userCats: { income: [], expense: ["自訂分類"] },
    settings: {
      budgetCap: 10000,
      catBudgets: {
        預設分類: 1000,
        自訂分類: 2000,
        歷史支出: 3000,
        歷史代墊: 4000,
        孤立分類: 5000,
        零額代墊: 6000,
        轉帳分類: 7000,
      },
    },
  });
  const calls = {
    commit: 0,
    render: 0,
    populate: 0,
    toasts: [],
    promptValue: null,
    confirm: true,
    confirmMessages: [],
  };
  const elements = {
    category: { value: "自訂分類" },
    amount: { value: "" },
    budgetCap: { value: "" },
    fundCategory: { value: "" },
  };
  const controller = createCategoryBudgetController({
    elements,
    store,
    toast: { show: (...args) => calls.toasts.push(args) },
    commitState: (mutator, { updateUi }) => {
      calls.commit += 1;
      store.update(mutator);
      updateUi(store.getState());
    },
    renderBudget: () => { calls.render += 1; },
    populateOptions: () => { calls.populate += 1; },
    constants: { expenseCategories: ["預設分類"] },
    promptInput: () => calls.promptValue,
    confirmCleanup: (message) => {
      calls.confirmMessages.push(message);
      return calls.confirm;
    },
  });
  return { store, calls, elements, controller };
}

test("adds a trimmed expense category and refreshes its fund option once", () => {
  const { store, calls, elements, controller } = createHarness();
  calls.promptValue = "  新分類  ";
  controller.addFundCategory();
  assert.deepEqual(store.getState().userCats.expense, ["自訂分類", "新分類"]);
  assert.equal(elements.fundCategory.value, "新分類");
  assert.equal(calls.commit, 1);
  assert.equal(calls.populate, 1);
  assert.equal(calls.render, 0);
  assert.deepEqual(calls.toasts, [["已新增分類：新分類"]]);
});

test("blank or cancelled category prompts leave state unchanged", () => {
  const { store, calls, controller } = createHarness();
  const original = structuredClone(store.getState());
  calls.promptValue = null;
  controller.addFundCategory();
  calls.promptValue = "   ";
  controller.addFundCategory();
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.commit, 0);
  assert.equal(calls.populate, 0);
  assert.deepEqual(calls.toasts, []);
});

test("default and custom duplicate categories are rejected", () => {
  const { store, calls, controller } = createHarness();
  const original = structuredClone(store.getState());
  calls.promptValue = "預設分類";
  controller.addFundCategory();
  calls.promptValue = "自訂分類";
  controller.addFundCategory();
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.commit, 0);
  assert.deepEqual(calls.toasts, [
    ["這個分類已經存在", "error"],
    ["這個分類已經存在", "error"],
  ]);
});

test("sets a normalized positive category budget and renders once", () => {
  const { store, calls, elements, controller } = createHarness();
  elements.category.value = "自訂分類";
  elements.amount.value = "2,000.5";
  controller.setCatBudget();
  assert.equal(store.getState().settings.catBudgets.自訂分類, 2001);
  assert.equal(calls.commit, 1);
  assert.equal(calls.render, 1);
  assert.deepEqual(calls.toasts, [["已設定分類預算"]]);
});

test("rejects zero, negative, and invalid category budgets", () => {
  const { store, calls, elements, controller } = createHarness();
  const original = structuredClone(store.getState());
  for (const value of ["0", "-1", "not-money"]) {
    elements.amount.value = value;
    controller.setCatBudget();
  }
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.commit, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.toasts.length, 3);
  assert.ok(calls.toasts.every((entry) => entry[1] === "error"));
});

test("deletes only the requested budget and preserves the existing missing-key commit", () => {
  const { store, calls, controller } = createHarness();
  controller.delCatBudget("孤立分類");
  controller.delCatBudget("不存在");
  assert.equal("孤立分類" in store.getState().settings.catBudgets, false);
  assert.equal(store.getState().settings.catBudgets.自訂分類, 2000);
  assert.equal(calls.commit, 2);
  assert.equal(calls.render, 2);
});

test("updates the monthly cap with integer normalization and allows zero", () => {
  const { store, calls, elements, controller } = createHarness();
  elements.budgetCap.value = "30,000.6";
  controller.updateBudgetCap();
  assert.equal(store.getState().settings.budgetCap, 30001);
  elements.budgetCap.value = "0";
  controller.updateBudgetCap();
  assert.equal(store.getState().settings.budgetCap, 0);
  assert.equal(calls.commit, 2);
  assert.equal(calls.render, 2);
});

test("cleanup preserves defaults, custom categories, and historical personal expenses", () => {
  const { store, calls, controller } = createHarness();
  controller.cleanupCatBudgets();
  assert.deepEqual(store.getState().settings.catBudgets, {
    預設分類: 1000,
    自訂分類: 2000,
    歷史支出: 3000,
    歷史代墊: 4000,
  });
  assert.equal(calls.commit, 1);
  assert.equal(calls.render, 1);
  assert.match(calls.confirmMessages[0], /孤立分類/);
  assert.match(calls.confirmMessages[0], /零額代墊/);
  assert.match(calls.confirmMessages[0], /轉帳分類/);
  assert.deepEqual(calls.toasts, [["已清理 3 個未使用分類預算"]]);
});

test("cancelled cleanup leaves category budgets unchanged", () => {
  const { store, calls, controller } = createHarness();
  const original = structuredClone(store.getState());
  calls.confirm = false;
  controller.cleanupCatBudgets();
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.commit, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.confirmMessages.length, 1);
});

test("cleanup with no unused budgets only notifies, and reset has no side effects", () => {
  const { store, calls, controller } = createHarness();
  store.update((draft) => {
    draft.settings.catBudgets = {
      預設分類: 1000,
      自訂分類: 2000,
      歷史支出: 3000,
      歷史代墊: 4000,
    };
  });
  const original = structuredClone(store.getState());
  controller.cleanupCatBudgets();
  controller.reset();
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.commit, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.confirmMessages.length, 0);
  assert.deepEqual(calls.toasts, [["目前沒有需要清理的分類預算"]]);
});
