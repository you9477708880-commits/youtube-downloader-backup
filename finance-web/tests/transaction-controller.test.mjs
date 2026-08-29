import assert from "node:assert/strict";
import { test } from "node:test";
import { createTransactionController } from "../src/app/controllers/transaction-controller.js";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

function createState(overrides = {}) {
  const initial = createInitialState();
  return {
    ...initial,
    txType: "expense",
    txs: [],
    sinkingFunds: [],
    accounts: [
      { id: "cash", name: "現金", type: "asset", initialBalance: 0 },
      { id: "bank", name: "銀行", type: "asset", initialBalance: 0 },
    ],
    settings: { ...initial.settings, budgetCap: 10000, catBudgets: {} },
    ...overrides,
    settings: { ...initial.settings, budgetCap: 10000, catBudgets: {}, ...(overrides.settings || {}) },
  };
}

function createHarness(t, stateOverrides = {}) {
  const store = createStore(createState(stateOverrides));
  const calls = {
    commit: 0,
    save: 0,
    renderAll: 0,
    activeTabs: [],
    editModes: [],
    toasts: [],
    shortfallRequests: [],
    shortfallChoices: [],
    promptResponses: [],
    confirmResponses: [],
    confirmMessages: [],
    syncTxType: 0,
    renderCategories: 0,
    populateSubcategories: 0,
    populateFunds: 0,
    populateCategoryBudgets: 0,
    scroll: 0,
  };
  const categoryOptions = ["餐飲", "薪資", "其他", "代墊", "轉帳"].map((value) => ({ value }));
  const dom = {
    filterStart: { value: "" },
    filterEnd: { value: "" },
    filterPreset: { value: "month" },
    inputAmount: { value: "" },
    inputOwnAmount: { value: "" },
    inputAdvancePerson: { value: "" },
    inputFund: { value: "" },
    inputSubcategory: { value: "未分類" },
    inputDesc: { value: "" },
    inputDate: { value: "2026-08-15" },
    inputCategory: {
      value: "餐飲",
      options: categoryOptions,
      append(option) {
        this.options.push(option);
      },
    },
    inputAccount: { value: "cash" },
    inputFromAccount: { value: "cash" },
    inputToAccount: { value: "bank" },
    root: {
      getElementById: (id) => id === "form-tx"
        ? { scrollIntoView: () => { calls.scroll += 1; } }
        : null,
    },
  };
  const ui = {
    toast: { show: (...args) => calls.toasts.push(args) },
    setActiveTab: (tabId) => calls.activeTabs.push(tabId),
    setTransactionEditMode: (value) => calls.editModes.push(value),
    syncTxType: () => { calls.syncTxType += 1; },
    renderTransactionCategorySelect: () => { calls.renderCategories += 1; },
    populateTransactionSubcategoryOptions: () => { calls.populateSubcategories += 1; },
    populateFundOptions: () => { calls.populateFunds += 1; },
    populateCategoryBudgetOptions: () => { calls.populateCategoryBudgets += 1; },
    askFundShortfallChoice: async (request) => {
      calls.shortfallRequests.push(request);
      return calls.shortfallChoices.shift() ?? "";
    },
  };

  const previousWindow = globalThis.window;
  const previousOption = globalThis.Option;
  globalThis.window = {
    prompt: () => calls.promptResponses.length ? calls.promptResponses.shift() : null,
    confirm: () => calls.confirmResponses.length ? calls.confirmResponses.shift() : true,
  };
  globalThis.Option = class Option {
    constructor(text, value) {
      this.text = text;
      this.value = value;
    }
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousOption === undefined) delete globalThis.Option;
    else globalThis.Option = previousOption;
  });

  const controller = createTransactionController({
    elements: {
      root: dom.root,
      amount: dom.inputAmount,
      ownAmount: dom.inputOwnAmount,
      advancePerson: dom.inputAdvancePerson,
      fund: dom.inputFund,
      subcategory: dom.inputSubcategory,
      description: dom.inputDesc,
      date: dom.inputDate,
      category: dom.inputCategory,
      account: dom.inputAccount,
      fromAccount: dom.inputFromAccount,
      toAccount: dom.inputToAccount,
    },
    store,
    toast: ui.toast,
    setEditMode: ui.setTransactionEditMode,
    commitState: (mutator, { updateUi }) => {
      calls.commit += 1;
      calls.save += 1;
      store.update(mutator);
      updateUi(store.getState());
    },
    renderAll: () => { calls.renderAll += 1; },
    navigate: (tabId) => {
      calls.activeTabs.push(tabId);
      calls.renderAll += 1;
    },
    syncTxType: ui.syncTxType,
    renderTransactionCategorySelect: ui.renderTransactionCategorySelect,
    populateTransactionSubcategoryOptions: ui.populateTransactionSubcategoryOptions,
    populateFundOptions: ui.populateFundOptions,
    populateCategoryBudgetOptions: ui.populateCategoryBudgetOptions,
    askFundShortfallChoice: ui.askFundShortfallChoice,
    constants: {
      incomeCategories: ["薪資"],
      expenseCategories: ["餐飲", "其他"],
    },
    confirmDelete: (message) => {
      calls.confirmMessages.push(message);
      return calls.confirmResponses.length ? calls.confirmResponses.shift() : true;
    },
    promptInput: () => calls.promptResponses.length ? calls.promptResponses.shift() : null,
  });
  return { actions: controller, calls, controller, dom, store };
}

function fillTransaction(dom, overrides = {}) {
  dom.inputAmount.value = overrides.amount ?? "600";
  dom.inputDesc.value = overrides.desc ?? "午餐";
  dom.inputDate.value = overrides.date ?? "2026-08-15";
  dom.inputCategory.value = overrides.category ?? "餐飲";
  dom.inputSubcategory.value = overrides.subcategory ?? "便當";
  dom.inputAccount.value = overrides.accountId ?? "cash";
  dom.inputFromAccount.value = overrides.fromAcc ?? "cash";
  dom.inputToAccount.value = overrides.toAcc ?? "bank";
  dom.inputOwnAmount.value = overrides.ownAmount ?? "";
  dom.inputAdvancePerson.value = overrides.person ?? "";
  dom.inputFund.value = overrides.linkedFundId ?? "";
}

function fund(overrides = {}) {
  return {
    id: "fund-1",
    name: "旅遊",
    category: "其他",
    targetAmount: 30000,
    monthlyContribution: 1000,
    startMonth: "2026-08",
    targetMonth: "",
    carryoverEnabled: true,
    note: "",
    events: [],
    ...overrides,
  };
}

function advanceRows() {
  return [
    {
      id: "adv-1",
      type: "advance",
      amount: 5000,
      ownAmount: 1000,
      receivableAmount: 4000,
      person: "小明",
      desc: "聚餐代墊",
      date: "2026-08-01",
      cat: "餐飲",
      category: "餐飲",
      subcategory: "聚餐",
      acc: "cash",
    },
    {
      id: "repay-1",
      type: "advance_repayment",
      advanceId: "adv-1",
      amount: 1000,
      date: "2026-08-05",
      acc: "cash",
      cat: "代墊收款",
      category: "代墊收款",
      subcategory: "未分類",
      desc: "小明 還款",
      person: "小明",
    },
    {
      id: "repay-2",
      type: "advance_repayment",
      advanceId: "adv-1",
      amount: 500,
      date: "2026-08-06",
      acc: "bank",
      cat: "代墊收款",
      category: "代墊收款",
      subcategory: "未分類",
      desc: "小明 還款",
      person: "小明",
    },
  ];
}

test("adds income and transfer records with their current save and render flow", async (t) => {
  const incomeHarness = createHarness(t);
  incomeHarness.actions.setTxType("income");
  fillTransaction(incomeHarness.dom, { amount: "2500", desc: "兼職", category: "薪資", subcategory: "獎金", accountId: "bank" });

  await incomeHarness.actions.addTx();

  const income = incomeHarness.store.getState().txs[0];
  assert.match(income.id, /^tx-/);
  assert.deepEqual(
    { type: income.type, amount: income.amount, desc: income.desc, category: income.category, subcategory: income.subcategory, acc: income.acc },
    { type: "income", amount: 2500, desc: "兼職", category: "薪資", subcategory: "獎金", acc: "bank" },
  );
  assert.equal(incomeHarness.calls.save, 1);
  assert.equal(incomeHarness.calls.renderAll, 2);
  assert.deepEqual(incomeHarness.calls.activeTabs, ["ov"]);

  const transferHarness = createHarness(t, { txs: [{ id: "older", type: "income", amount: 1, date: "2026-01-01", acc: "cash" }] });
  transferHarness.actions.setTxType("transfer");
  fillTransaction(transferHarness.dom, { amount: "800", desc: "移到銀行", fromAcc: "cash", toAcc: "bank" });

  await transferHarness.actions.addTx();

  const transfer = transferHarness.store.getState().txs[0];
  assert.deepEqual(
    { type: transfer.type, amount: transfer.amount, fromAcc: transfer.fromAcc, toAcc: transfer.toAcc, cat: transfer.cat },
    { type: "transfer", amount: 800, fromAcc: "cash", toAcc: "bank", cat: "轉帳" },
  );
  assert.equal(transferHarness.store.getState().txs[1].id, "older");
});

test("invalid amounts and same-account transfers leave state unchanged", async (t) => {
  const { actions, calls, dom, store } = createHarness(t);
  const original = structuredClone(store.getState());

  fillTransaction(dom, { amount: "0" });
  await actions.addTx();
  actions.setTxType("transfer");
  fillTransaction(dom, { amount: "500", fromAcc: "cash", toAcc: "cash" });
  await actions.addTx();

  assert.deepEqual(store.getState().txs, original.txs);
  assert.equal(calls.save, 0);
  assert.equal(calls.commit, 0);
  assert.equal(calls.renderAll, 0);
  assert.deepEqual(calls.toasts.map((entry) => entry[1]), ["error", "error"]);
});

test("adds advances and rejects edits whose receivable falls below recorded repayments", async (t) => {
  const addHarness = createHarness(t);
  addHarness.actions.setTxType("advance");
  fillTransaction(addHarness.dom, { amount: "5000", ownAmount: "1200", person: "小華", category: "餐飲", accountId: "cash" });

  await addHarness.actions.addTx();

  const added = addHarness.store.getState().txs[0];
  assert.deepEqual(
    { type: added.type, amount: added.amount, ownAmount: added.ownAmount, receivableAmount: added.receivableAmount, person: added.person, acc: added.acc },
    { type: "advance", amount: 5000, ownAmount: 1200, receivableAmount: 3800, person: "小華", acc: "cash" },
  );

  const editHarness = createHarness(t, { txs: advanceRows() });
  editHarness.actions.beginEditTx("adv-1");
  fillTransaction(editHarness.dom, { amount: "4000", ownAmount: "3000", person: "小明", category: "餐飲", accountId: "cash" });
  const beforeEdit = structuredClone(editHarness.store.getState().txs);

  await editHarness.actions.addTx();

  assert.deepEqual(editHarness.store.getState().txs, beforeEdit);
  assert.equal(editHarness.calls.save, 0);
  assert.match(editHarness.calls.toasts.at(-1)[0], /不能低於已收回的 1500/);
});

test("a fully covered fund expense creates one linked spend event", async (t) => {
  const { actions, calls, dom, store } = createHarness(t, { sinkingFunds: [fund()] });
  fillTransaction(dom, { amount: "600", linkedFundId: "fund-1" });

  await actions.addTx();

  const tx = store.getState().txs[0];
  const events = store.getState().sinkingFunds[0].events;
  assert.equal(tx.linkedFundId, "fund-1");
  assert.equal(events.length, 1);
  assert.deepEqual(
    { type: events[0].type, amount: events[0].amount, date: events[0].date, linkedTxId: events[0].linkedTxId },
    { type: "spend", amount: 600, date: "2026-08-15", linkedTxId: tx.id },
  );
  assert.equal(calls.shortfallRequests.length, 0);
  assert.equal(calls.save, 1);
});

test("fund shortfall top-up creates linked topup and spend events only when free budget is sufficient", async (t) => {
  const success = createHarness(t, { sinkingFunds: [fund()] });
  success.calls.shortfallChoices.push("topup");
  fillTransaction(success.dom, { amount: "1500", linkedFundId: "fund-1" });

  await success.actions.addTx();

  const tx = success.store.getState().txs[0];
  assert.deepEqual(
    success.store.getState().sinkingFunds[0].events.map((event) => ({ type: event.type, amount: event.amount, linkedTxId: event.linkedTxId })),
    [
      { type: "topup", amount: 500, linkedTxId: tx.id },
      { type: "spend", amount: 1500, linkedTxId: tx.id },
    ],
  );
  assert.deepEqual(success.calls.shortfallRequests[0], {
    fundName: "旅遊",
    availableFromFund: 1000,
    amount: 1500,
    shortfall: 500,
    availableFreedom: 9000,
  });

  const rejected = createHarness(t, { sinkingFunds: [fund()], settings: { budgetCap: 1100 } });
  rejected.calls.shortfallChoices.push("topup");
  fillTransaction(rejected.dom, { amount: "1500", linkedFundId: "fund-1" });
  const original = structuredClone(rejected.store.getState());

  await rejected.actions.addTx();

  assert.deepEqual(rejected.store.getState(), original);
  assert.equal(rejected.calls.save, 0);
  assert.equal(rejected.calls.renderAll, 0);
  assert.equal(rejected.calls.toasts.at(-1)[1], "error");
});

test("partial, unlink, and cancelled fund choices preserve their distinct accounting outcomes", async (t) => {
  const partial = createHarness(t, { sinkingFunds: [fund()] });
  partial.calls.shortfallChoices.push("partial");
  fillTransaction(partial.dom, { amount: "1500", linkedFundId: "fund-1" });
  await partial.actions.addTx();
  assert.equal(partial.store.getState().txs[0].linkedFundId, "fund-1");
  assert.deepEqual(
    partial.store.getState().sinkingFunds[0].events.map((event) => [event.type, event.amount]),
    [["spend", 1000]],
  );

  const zeroAvailable = createHarness(t, { sinkingFunds: [fund({ startMonth: "2026-09" })] });
  zeroAvailable.calls.shortfallChoices.push("partial");
  fillTransaction(zeroAvailable.dom, { amount: "1500", linkedFundId: "fund-1" });
  await zeroAvailable.actions.addTx();
  assert.equal("linkedFundId" in zeroAvailable.store.getState().txs[0], false);
  assert.deepEqual(zeroAvailable.store.getState().sinkingFunds[0].events, []);

  const unlinked = createHarness(t, { sinkingFunds: [fund()] });
  unlinked.calls.shortfallChoices.push("unlink");
  fillTransaction(unlinked.dom, { amount: "1500", linkedFundId: "fund-1" });
  await unlinked.actions.addTx();
  assert.equal("linkedFundId" in unlinked.store.getState().txs[0], false);
  assert.deepEqual(unlinked.store.getState().sinkingFunds[0].events, []);

  const cancelled = createHarness(t, { sinkingFunds: [fund()] });
  cancelled.calls.shortfallChoices.push("");
  fillTransaction(cancelled.dom, { amount: "1500", linkedFundId: "fund-1" });
  const original = structuredClone(cancelled.store.getState());
  await cancelled.actions.addTx();
  assert.deepEqual(cancelled.store.getState(), original);
  assert.equal(cancelled.calls.save, 0);
});

test("editing a linked expense preserves its ID and replaces all old linked fund events", async (t) => {
  const linkedTx = {
    id: "tx-linked",
    type: "expense",
    amount: 600,
    desc: "舊支出",
    date: "2026-08-15",
    cat: "餐飲",
    category: "餐飲",
    subcategory: "便當",
    acc: "cash",
    linkedFundId: "fund-1",
  };
  const { actions, calls, dom, store } = createHarness(t, {
    txs: [linkedTx, { id: "unrelated-tx", type: "income", amount: 100, date: "2026-08-01", acc: "cash" }],
    sinkingFunds: [fund({ events: [
      { id: "old-topup", type: "topup", amount: 100, date: "2026-08-15", linkedTxId: "tx-linked" },
      { id: "old-spend", type: "spend", amount: 600, date: "2026-08-15", linkedTxId: "tx-linked" },
      { id: "unrelated-event", type: "topup", amount: 50, date: "2026-08-01" },
    ] })],
  });

  actions.beginEditTx("tx-linked");
  assert.equal(dom.inputFund.value, "");
  fillTransaction(dom, { amount: "900", desc: "修改後", linkedFundId: "fund-1" });
  await actions.addTx();

  const state = store.getState();
  assert.deepEqual(state.txs.map((tx) => tx.id), ["tx-linked", "unrelated-tx"]);
  assert.equal(state.txs[0].amount, 900);
  assert.equal(state.txs[0].desc, "修改後");
  assert.equal(state.sinkingFunds[0].events.some((event) => ["old-topup", "old-spend"].includes(event.id)), false);
  assert.equal(state.sinkingFunds[0].events.some((event) => event.id === "unrelated-event"), true);
  const replacement = state.sinkingFunds[0].events.find((event) => event.linkedTxId === "tx-linked");
  assert.deepEqual({ type: replacement.type, amount: replacement.amount }, { type: "spend", amount: 900 });
  assert.equal(calls.save, 1);
});

test("begin and cancel edit fill and reset the form while transaction type stays locked", (t) => {
  const linkedTx = {
    id: "tx-linked",
    type: "expense",
    amount: 600,
    desc: "舊支出",
    date: "2026-08-15",
    cat: "餐飲",
    category: "餐飲",
    subcategory: "便當",
    acc: "cash",
    linkedFundId: "fund-1",
  };
  const { actions, calls, dom, store } = createHarness(t, { txs: [linkedTx], sinkingFunds: [fund()] });

  actions.beginEditTx("tx-linked");
  actions.setTxType("income");

  assert.equal(store.getState().txType, "expense");
  assert.equal(dom.inputAmount.value, 600);
  assert.equal(dom.inputDesc.value, "舊支出");
  assert.equal(dom.inputSubcategory.value, "便當");
  assert.equal(dom.inputAccount.value, "cash");
  assert.equal(dom.inputFund.value, "");
  assert.deepEqual(calls.editModes.at(-1), { active: true, linkedFundName: "旅遊", advanceRepaidAmount: 0 });
  assert.equal(calls.scroll, 1);

  actions.cancelEditTx();
  assert.equal(dom.inputAmount.value, "");
  assert.equal(dom.inputDesc.value, "");
  assert.equal(dom.inputSubcategory.value, "");
  assert.deepEqual(calls.editModes.at(-1), { active: false });
  assert.equal(calls.save, 0);
});

test("deleting linked transactions removes fund events and deleting an advance cascades repayments", (t) => {
  const txs = [
    ...advanceRows(),
    { id: "unrelated", type: "income", amount: 100, date: "2026-08-01", acc: "cash" },
  ];
  const { actions, calls, store } = createHarness(t, {
    txs,
    sinkingFunds: [fund({ events: [
      { id: "linked", type: "spend", amount: 100, date: "2026-08-01", linkedTxId: "adv-1" },
      { id: "kept", type: "topup", amount: 50, date: "2026-08-01" },
    ] })],
  });
  calls.confirmResponses.push(false, true);

  assert.equal(actions.delTx("adv-1"), false);
  assert.deepEqual(store.getState().txs, txs);
  assert.equal(calls.save, 0);

  assert.equal(actions.delTx("adv-1"), true);
  assert.deepEqual(store.getState().txs.map((tx) => tx.id), ["unrelated"]);
  assert.deepEqual(store.getState().sinkingFunds[0].events.map((event) => event.id), ["kept"]);
  assert.equal(calls.save, 1);
  assert.equal(calls.commit, 1);
  assert.equal(calls.renderAll, 1);
});

test("deleting a balance adjustment explains that the account balance will be recalculated", (t) => {
  const { actions, calls, store } = createHarness(t, {
    txs: [{ id: "adjustment-1", type: "balance_adjustment", direction: "increase", amount: 1000, date: "2026-08-29", acc: "cash" }],
  });
  calls.confirmResponses.push(true);

  assert.equal(actions.delTx("adjustment-1"), true);
  assert.equal(store.getState().txs.length, 0);
  assert.match(calls.confirmMessages[0], /帳戶餘額會回到調整前/);
  assert.match(calls.toasts.at(-1)[0], /已刪除帳戶調整/);
});

test("repaying an advance creates a linked non-income repayment and rejects cancelled or excessive amounts", (t) => {
  const success = createHarness(t, { txs: advanceRows() });
  success.calls.promptResponses.push("1200", "2");

  success.actions.repayAdvance("adv-1");

  const repayment = success.store.getState().txs[0];
  assert.match(repayment.id, /^repay-/);
  assert.deepEqual(
    { type: repayment.type, advanceId: repayment.advanceId, amount: repayment.amount, acc: repayment.acc, category: repayment.category, person: repayment.person },
    { type: "advance_repayment", advanceId: "adv-1", amount: 1200, acc: "bank", category: "代墊收款", person: "小明" },
  );
  assert.match(repayment.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(success.calls.save, 1);
  assert.equal(success.calls.renderAll, 1);

  const rejected = createHarness(t, { txs: advanceRows() });
  const original = structuredClone(rejected.store.getState());
  rejected.calls.promptResponses.push(null);
  rejected.actions.repayAdvance("adv-1");
  rejected.calls.promptResponses.push("9999");
  rejected.actions.repayAdvance("adv-1");
  rejected.actions.repayAdvance("missing");
  assert.deepEqual(rejected.store.getState(), original);
  assert.equal(rejected.calls.save, 0);
  assert.equal(rejected.calls.toasts.filter((entry) => entry[1] === "error").length, 2);
});

test("editing a repayment changes only amount, date, and account while enforcing amount and date guards", (t) => {
  const success = createHarness(t, { txs: advanceRows() });
  const originalRepayment = structuredClone(success.store.getState().txs[1]);
  success.calls.promptResponses.push("1200", "2026-08-20", "2");

  success.actions.editAdvanceRepayment("repay-1");

  const edited = success.store.getState().txs.find((tx) => tx.id === "repay-1");
  assert.deepEqual(
    { id: edited.id, advanceId: edited.advanceId, amount: edited.amount, date: edited.date, acc: edited.acc, desc: edited.desc, person: edited.person },
    { id: "repay-1", advanceId: "adv-1", amount: 1200, date: "2026-08-20", acc: "bank", desc: originalRepayment.desc, person: originalRepayment.person },
  );
  assert.equal(success.calls.save, 1);
  assert.equal(success.calls.renderAll, 1);

  const invalidAmount = createHarness(t, { txs: advanceRows() });
  const amountSnapshot = structuredClone(invalidAmount.store.getState());
  invalidAmount.calls.promptResponses.push("4000");
  invalidAmount.actions.editAdvanceRepayment("repay-1");
  assert.deepEqual(invalidAmount.store.getState(), amountSnapshot);
  assert.equal(invalidAmount.calls.save, 0);

  const invalidDate = createHarness(t, { txs: advanceRows() });
  const dateSnapshot = structuredClone(invalidDate.store.getState());
  invalidDate.calls.promptResponses.push("1200", "2026/08/20");
  invalidDate.actions.editAdvanceRepayment("repay-1");
  assert.deepEqual(invalidDate.store.getState(), dateSnapshot);
  assert.equal(invalidDate.calls.save, 0);
});

test("reset clears stale transaction edit identity before a whole-state replacement", async (t) => {
  const originalTx = {
    id: "tx-editing",
    type: "expense",
    amount: 600,
    desc: "舊資料",
    date: "2026-08-15",
    cat: "餐飲",
    category: "餐飲",
    subcategory: "便當",
    acc: "cash",
  };
  const { actions, calls, controller, dom, store } = createHarness(t, { txs: [originalTx] });
  actions.beginEditTx("tx-editing");

  controller.reset();
  store.replace(createState({ txs: [{ ...originalTx, desc: "切換後資料" }] }));
  fillTransaction(dom, { amount: "900", desc: "切換後新增" });
  await actions.addTx();

  const txs = store.getState().txs;
  assert.equal(txs.length, 2);
  assert.match(txs[0].id, /^tx-/);
  assert.notEqual(txs[0].id, "tx-editing");
  assert.equal(txs[0].desc, "切換後新增");
  assert.equal(txs[1].id, "tx-editing");
  assert.equal(txs[1].desc, "切換後資料");
  assert.equal(calls.save, 1);
});

test("detail edit preserves an unchanged fund link and external provenance", async (t) => {
  const linkedTx = {
    id: "tx-detail", type: "expense", amount: 600, desc: "舊備註", date: "2026-08-15",
    cat: "餐飲", category: "餐飲", subcategory: "午餐", acc: "cash", linkedFundId: "fund-1",
    externalSource: "andromoney", externalId: "csv-1",
  };
  const { actions, store } = createHarness(t, {
    txs: [linkedTx],
    sinkingFunds: [fund({ events: [{ id: "spend-1", type: "spend", amount: 600, date: "2026-08-15", note: "舊備註", linkedTxId: "tx-detail" }] })],
  });

  const saved = await actions.updateTransactionFromDetail("tx-detail", {
    type: "expense", amount: "600", date: "2026-08-15", category: "餐飲", subcategory: "晚餐",
    accountId: "bank", desc: "卡片內修改",
  });

  const state = store.getState();
  assert.equal(saved, true);
  assert.equal(state.txs[0].linkedFundId, "fund-1");
  assert.equal(state.txs[0].externalSource, "andromoney");
  assert.equal(state.txs[0].externalId, "csv-1");
  assert.equal(state.txs[0].acc, "bank");
  assert.equal(state.sinkingFunds[0].events[0].note, "卡片內修改");
});

test("detail edit can change type and removes obsolete fund events", async (t) => {
  const { actions, store, calls } = createHarness(t, {
    txs: [{ id: "tx-linked", type: "expense", amount: 600, desc: "午餐", date: "2026-08-15", cat: "餐飲", category: "餐飲", subcategory: "午餐", acc: "cash", linkedFundId: "fund-1" }],
    sinkingFunds: [fund({ events: [{ id: "spend-1", type: "spend", amount: 600, date: "2026-08-15", linkedTxId: "tx-linked" }] })],
  });

  const saved = await actions.updateTransactionFromDetail("tx-linked", {
    type: "transfer", amount: "600", date: "2026-08-16", fromAcc: "cash", toAcc: "bank", desc: "改成轉帳",
  });

  const tx = store.getState().txs[0];
  assert.equal(saved, true);
  assert.deepEqual({ type: tx.type, fromAcc: tx.fromAcc, toAcc: tx.toAcc, acc: tx.acc, linkedFundId: tx.linkedFundId }, {
    type: "transfer", fromAcc: "cash", toAcc: "bank", acc: undefined, linkedFundId: undefined,
  });
  assert.deepEqual(store.getState().sinkingFunds[0].events, []);
  assert.match(calls.toasts.at(-1)[0], /準備指定已移除/);
});

test("detail edit blocks changing an advance that already has repayments", async (t) => {
  const { actions, store, calls } = createHarness(t, { txs: advanceRows() });
  const before = structuredClone(store.getState());
  const saved = await actions.updateTransactionFromDetail("adv-1", {
    type: "expense", amount: "5000", date: "2026-08-01", category: "餐飲", subcategory: "聚餐", accountId: "cash", desc: "不應儲存",
  });

  assert.equal(saved, false);
  assert.deepEqual(store.getState(), before);
  assert.match(calls.toasts.at(-1)[0], /已有收款紀錄/);
});

test("detail edit updates repayment fields but keeps its advance relationship", async (t) => {
  const { actions, store } = createHarness(t, { txs: advanceRows() });
  const saved = await actions.updateTransactionFromDetail("repay-1", {
    type: "advance_repayment", amount: "1200", date: "2026-08-07", accountId: "bank", desc: "現場收回",
  });

  const repayment = store.getState().txs.find((tx) => tx.id === "repay-1");
  assert.equal(saved, true);
  assert.deepEqual(
    { amount: repayment.amount, date: repayment.date, acc: repayment.acc, desc: repayment.desc, advanceId: repayment.advanceId, type: repayment.type },
    { amount: 1200, date: "2026-08-07", acc: "bank", desc: "現場收回", advanceId: "adv-1", type: "advance_repayment" },
  );
});

test("detail edit preserves deleted account references when only content changes", async (t) => {
  const { actions, store } = createHarness(t, {
    accounts: [{ id: "bank", name: "銀行", type: "asset", initialBalance: 0 }],
    txs: [{ id: "tx-deleted-account", type: "expense", amount: 300, date: "2026-08-10", category: "餐飲", subcategory: "午餐", cat: "餐飲", acc: "deleted-cash", desc: "原備註" }],
  });

  const saved = await actions.updateTransactionFromDetail("tx-deleted-account", {
    type: "expense", amount: "300", date: "2026-08-10", category: "餐飲", subcategory: "午餐",
    accountId: "deleted-cash", desc: "只改備註",
  });

  assert.equal(saved, true);
  assert.equal(store.getState().txs[0].acc, "deleted-cash");
  assert.equal(store.getState().txs[0].desc, "只改備註");
});

test("detail edit preserves legacy spread fields while the record remains an expense", async (t) => {
  const { actions, store } = createHarness(t, {
    txs: [{
      id: "tx-spread", type: "expense", amount: 1200, date: "2026-08-10", category: "費用", subcategory: "保險", cat: "費用", acc: "cash", desc: "舊保費",
      budgetMode: "spread", spreadMonths: 12, spreadStartMonth: "2026-08", spreadLabel: "年度保費",
    }],
  });

  const saved = await actions.updateTransactionFromDetail("tx-spread", {
    type: "expense", amount: "1200", date: "2026-08-10", category: "費用", subcategory: "保險", accountId: "bank", desc: "新保費備註",
  });

  const tx = store.getState().txs[0];
  assert.equal(saved, true);
  assert.deepEqual(
    { budgetMode: tx.budgetMode, spreadMonths: tx.spreadMonths, spreadStartMonth: tx.spreadStartMonth, spreadLabel: tx.spreadLabel },
    { budgetMode: "spread", spreadMonths: 12, spreadStartMonth: "2026-08", spreadLabel: "年度保費" },
  );
});

test("detail edit clears a stale main-form editor for the same transaction", async (t) => {
  const original = { id: "tx-both", type: "expense", amount: 500, date: "2026-08-10", category: "餐飲", subcategory: "午餐", cat: "餐飲", acc: "cash", desc: "舊值" };
  const { actions, calls, dom, store } = createHarness(t, { txs: [original] });
  actions.beginEditTx("tx-both");

  const saved = await actions.updateTransactionFromDetail("tx-both", {
    type: "expense", amount: "500", date: "2026-08-10", category: "餐飲", subcategory: "午餐", accountId: "cash", desc: "卡片新值",
  });

  assert.equal(saved, true);
  assert.equal(dom.inputAmount.value, "");
  assert.deepEqual(calls.editModes.at(-1), { active: false });
  fillTransaction(dom, { amount: "900", desc: "另一筆新交易" });
  await actions.addTx();
  assert.equal(store.getState().txs.length, 2);
  assert.equal(store.getState().txs.find((tx) => tx.id === "tx-both").desc, "卡片新值");
});
