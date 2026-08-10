import assert from "node:assert/strict";
import { test } from "node:test";
import { createSinkingFundController } from "../src/app/controllers/sinking-fund-controller.js";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

function createHarness(t) {
  const baseState = createInitialState();
  const store = createStore({
    ...baseState,
    settings: { ...baseState.settings, budgetCap: 100000 },
    txs: [
      { id: "tx-linked", type: "expense", amount: 3000, date: "2026-08-01", cat: "其他", acc: "cash", linkedFundId: "fund-1" },
      { id: "tx-other", type: "income", amount: 2000, date: "2026-08-02", cat: "薪資", acc: "cash" },
    ],
    sinkingFunds: [
      {
        id: "fund-1",
        name: "旅遊",
        category: "娛樂",
        targetAmount: 30000,
        monthlyContribution: 2000,
        startMonth: "2026-01",
        targetMonth: "2026-12",
        carryoverEnabled: true,
        note: "原始備註",
        events: [
          { id: "event-topup", type: "topup", amount: 1000, date: "2026-07-01", note: "保留事件" },
          { id: "event-spend", type: "spend", amount: 500, date: "2026-08-01", linkedTxId: "tx-linked" },
        ],
      },
    ],
    wishes: [{ id: "wish-camera", name: "相機", price: 18000, cat: "3C / 家電" }],
    accounts: [{ id: "cash", name: "現金", type: "asset", initialBalance: 0 }],
  });
  const calls = {
    commit: 0,
    save: 0,
    renderWishlist: 0,
    renderAll: 0,
    populateFunds: 0,
    populateCategoryBudgets: 0,
    editModes: [],
    activeTabs: [],
    toasts: [],
    scrollForm: 0,
    scrollCard: 0,
    confirmResponses: [],
    promptResponses: [],
  };
  const card = {
    open: false,
    scrollIntoView: () => { calls.scrollCard += 1; },
  };
  const dom = {
    fundName: { value: "" },
    fundCategory: {
      value: "其他",
      options: [
        { value: "其他", textContent: "其他" },
        { value: "娛樂", textContent: "娛樂" },
        { value: "3C / 家電", textContent: "3C / 家電" },
      ],
    },
    fundTarget: { value: "" },
    fundMonthly: { value: "" },
    fundStart: { value: "2026-08" },
    fundTargetMonth: { value: "" },
    fundNote: { value: "" },
    fundCarry: { checked: true },
    root: {
      getElementById: (id) => ["form-fund", "form-wish"].includes(id)
        ? { scrollIntoView: () => { calls.scrollForm += 1; } }
        : null,
      querySelector: (selector) => selector.includes("fund-1") ? card : null,
    },
  };
  const ui = {
    toast: { show: (...args) => calls.toasts.push(args) },
    setFundEditMode: (value) => calls.editModes.push(value),
    setActiveTab: (tabId) => calls.activeTabs.push(tabId),
    populateCategoryBudgetOptions: () => { calls.populateCategoryBudgets += 1; },
    renderTransactionCategorySelect: () => {},
    populateFundOptions: () => { calls.populateFunds += 1; },
  };

  const actions = createSinkingFundController({
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
    commitState: (mutator, { updateUi }) => {
      calls.commit += 1;
      calls.save += 1;
      store.update(mutator);
      updateUi(store.getState());
    },
    renderWishlist: () => { calls.renderWishlist += 1; },
    navigate: (tabId) => {
      ui.setActiveTab(tabId);
      if (tabId === "wl") ui.populateCategoryBudgetOptions();
      calls.renderAll += 1;
    },
    populateFundOptions: ui.populateFundOptions,
    confirmAction: () => calls.confirmResponses.length ? calls.confirmResponses.shift() : true,
    promptInput: () => calls.promptResponses.length ? calls.promptResponses.shift() : null,
    now: () => new Date(2026, 7, 10),
    requestFrame: (callback) => callback(),
  });
  return { store, calls, dom, card, actions };
}

function fillValidFundForm(dom, overrides = {}) {
  dom.fundName.value = overrides.name ?? "新電腦";
  dom.fundCategory.value = overrides.category ?? "3C / 家電";
  dom.fundTarget.value = overrides.targetAmount ?? "50000";
  dom.fundMonthly.value = overrides.monthlyContribution ?? "5000";
  dom.fundStart.value = overrides.startMonth ?? "2026-08";
  dom.fundTargetMonth.value = overrides.targetMonth ?? "";
  dom.fundNote.value = overrides.note ?? "測試準備";
  dom.fundCarry.checked = overrides.carryoverEnabled ?? true;
}

test("adds a fund with empty events and saves and renders once", (t) => {
  const { store, calls, dom, actions } = createHarness(t);
  fillValidFundForm(dom);

  actions.addFund();

  const added = store.getState().sinkingFunds.at(-1);
  assert.match(added.id, /^sf-/);
  assert.deepEqual(
    {
      name: added.name,
      category: added.category,
      targetAmount: added.targetAmount,
      monthlyContribution: added.monthlyContribution,
      startMonth: added.startMonth,
      targetMonth: added.targetMonth,
      carryoverEnabled: added.carryoverEnabled,
      note: added.note,
      events: added.events,
    },
    {
      name: "新電腦",
      category: "3C / 家電",
      targetAmount: 50000,
      monthlyContribution: 5000,
      startMonth: "2026-08",
      targetMonth: "",
      carryoverEnabled: true,
      note: "測試準備",
      events: [],
    },
  );
  assert.equal(calls.save, 1);
  assert.equal(calls.commit, 1);
  assert.equal(calls.populateFunds, 1);
  assert.equal(calls.renderWishlist, 1);
});

test("editing a fund preserves identity and existing events", (t) => {
  const { store, calls, dom, actions } = createHarness(t);
  const originalEvents = structuredClone(store.getState().sinkingFunds[0].events);
  const originalTransactions = structuredClone(store.getState().txs);

  actions.beginEditFund("fund-1");
  fillValidFundForm(dom, { name: "環遊世界", targetAmount: "60000", monthlyContribution: "6000", note: "修改後" });
  actions.addFund();

  const edited = store.getState().sinkingFunds[0];
  assert.equal(edited.id, "fund-1");
  assert.equal(edited.name, "環遊世界");
  assert.equal(edited.targetAmount, 60000);
  assert.equal(edited.monthlyContribution, 6000);
  assert.deepEqual(edited.events, originalEvents);
  assert.deepEqual(store.getState().txs, originalTransactions);
  assert.deepEqual(calls.activeTabs, ["wl"]);
  assert.equal(calls.scrollForm, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.populateFunds, 1);
  assert.equal(calls.renderWishlist, 1);
});

test("invalid form values and a missing edit target leave state unchanged", (t) => {
  const { store, calls, dom, actions } = createHarness(t);
  const original = structuredClone(store.getState());

  fillValidFundForm(dom, { name: "", targetAmount: "0" });
  actions.addFund();
  actions.beginEditFund("missing");

  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.commit, 0);
  assert.equal(calls.populateFunds, 0);
  assert.equal(calls.renderWishlist, 0);
  assert.equal(calls.toasts[0][1], "error");
  assert.equal(calls.toasts[1][1], "error");
});

test("an infeasible target can be cancelled without mutation", (t) => {
  const { store, calls, dom, actions } = createHarness(t);
  const original = structuredClone(store.getState());
  fillValidFundForm(dom, {
    targetAmount: "100000",
    monthlyContribution: "1000",
    startMonth: "2026-08",
    targetMonth: "2026-09",
  });
  calls.confirmResponses.push(false);

  actions.addFund();

  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.renderWishlist, 0);
});

test("cancel edit resets the form without saving", (t) => {
  const { calls, dom, actions } = createHarness(t);

  actions.beginEditFund("fund-1");
  assert.equal(dom.fundName.value, "旅遊");
  assert.equal(dom.fundTarget.value, 30000);
  assert.equal(dom.fundMonthly.value, 2000);
  assert.equal(dom.fundNote.value, "原始備註");
  actions.cancelEditFund();

  assert.equal(dom.fundName.value, "");
  assert.equal(dom.fundTarget.value, "");
  assert.equal(dom.fundMonthly.value, "");
  assert.equal(dom.fundTargetMonth.value, "");
  assert.equal(dom.fundNote.value, "");
  assert.equal(dom.fundCarry.checked, true);
  assert.equal(calls.save, 0);
  assert.equal(calls.renderWishlist, 0);
  assert.deepEqual(calls.editModes.at(-1), { active: false });
});

test("deleting a fund atomically removes it and unlinks transactions", (t) => {
  const { store, calls, actions } = createHarness(t);
  const originalOtherTransaction = structuredClone(store.getState().txs[1]);
  calls.confirmResponses.push(false, true);

  actions.delFund("fund-1");
  assert.equal(store.getState().sinkingFunds.length, 1);
  assert.equal(calls.save, 0);

  actions.delFund("fund-1");
  assert.equal(store.getState().sinkingFunds.length, 0);
  assert.equal("linkedFundId" in store.getState().txs[0], false);
  assert.deepEqual(store.getState().txs[1], originalOtherTransaction);
  assert.equal(calls.save, 1);
  assert.equal(calls.populateFunds, 1);
  assert.equal(calls.renderWishlist, 1);
});

test("manual top-up appends one event without changing transactions", (t) => {
  const { store, calls, actions } = createHarness(t);
  const originalTransactions = structuredClone(store.getState().txs);
  calls.promptResponses.push("5000", "手動測試補入");

  actions.topupFund("fund-1");

  const event = store.getState().sinkingFunds[0].events.at(-1);
  assert.match(event.id, /^fe-/);
  assert.equal(event.type, "topup");
  assert.equal(event.amount, 5000);
  assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(event.note, "手動測試補入");
  assert.deepEqual(store.getState().txs, originalTransactions);
  assert.equal(calls.save, 1);
  assert.equal(calls.renderWishlist, 1);
  assert.equal(calls.populateFunds, 0);
});

test("cancelled and invalid top-ups do not mutate state", (t) => {
  const { store, calls, actions } = createHarness(t);
  const original = structuredClone(store.getState());

  calls.promptResponses.push(null);
  actions.topupFund("fund-1");
  calls.promptResponses.push("0");
  actions.topupFund("fund-1");
  calls.promptResponses.push("999999");
  actions.topupFund("fund-1");
  actions.topupFund("missing");

  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.renderWishlist, 0);
  assert.equal(calls.toasts.filter((entry) => entry[1] === "error").length, 3);
});

test("wishlist prefill changes only the fund form", (t) => {
  const { store, calls, dom, actions } = createHarness(t);
  const original = structuredClone(store.getState());

  actions.prepareFundFromWish("wish-camera");

  assert.deepEqual(store.getState(), original);
  assert.equal(dom.fundName.value, "相機");
  assert.equal(dom.fundTarget.value, 18000);
  assert.equal(dom.fundMonthly.value, 18000);
  assert.equal(dom.fundCategory.value, "3C / 家電");
  assert.equal(dom.fundTargetMonth.value, "");
  assert.equal(dom.fundCarry.checked, true);
  assert.match(dom.fundNote.value, /相機/);
  assert.equal(calls.save, 0);
  assert.equal(calls.populateFunds, 0);
  assert.equal(calls.renderWishlist, 0);
});

test("open fund navigates, renders, and expands the matching card", (t) => {
  const { calls, card, actions } = createHarness(t);

  actions.openFund("fund-1");

  assert.deepEqual(calls.activeTabs, ["wl"]);
  assert.equal(calls.renderAll, 1);
  assert.equal(calls.renderWishlist, 1);
  assert.equal(card.open, true);
  assert.equal(calls.scrollCard, 1);
});
