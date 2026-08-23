import assert from "node:assert/strict";
import { test } from "node:test";
import { bindAppEvents, dispatchDataAction } from "../src/app/event-bindings.js";

class FakeTarget {
  constructor(value = "") {
    this.value = value;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }

  emit(type, overrides = {}) {
    const event = {
      target: this,
      preventDefault() { this.defaultPrevented = true; },
      ...overrides,
    };
    (this.listeners.get(type) || []).slice().forEach((listener) => listener(event));
    return event;
  }
}

function createHarness() {
  const calls = [];
  const body = new FakeTarget();
  const win = new FakeTarget();
  const forms = Object.fromEntries(
    ["form-tx", "form-cat-bud", "form-wish", "form-bs", "form-fund"].map((id) => {
      const form = new FakeTarget();
      form.valid = true;
      form.checkValidity = () => form.valid;
      form.reportValidity = () => calls.push(["invalid", id]);
      return [id, form];
    }),
  );
  const doc = new FakeTarget();
  doc.body = body;
  doc.getElementById = (id) => forms[id] || null;
  const domKeys = [
    "filterPreset", "filterStart", "filterEnd", "inputCategory", "balanceType", "balanceAccountType",
    "txCancelButton", "fundCancelButton", "bsCancelButton", "wishCancelButton",
    "androMoneyCancel", "androMoneyConfirm", "androMoneyAccounts", "inputAmount", "inputOwnAmount",
    "budgetCapInput", "fundTarget", "fundMonthly", "balanceAmount", "catBudgetAmount",
    "wishPrice", "retireLinked", "authButton", "cloudStatus", "currentAge", "retirementAge", "deathAge",
    "retireAsset", "retireMonthly", "retirePrincipalReturn", "retireContributionReturn",
    "retireInflation", "retireWithdraw", "retireTarget", "fileImport", "fileAndroMoneyImport",
    "transactionSearchQuery", "transactionSearchPreset", "transactionSearchStart",
    "transactionSearchEnd", "transactionSearchClear", "transactionDetailModal",
    "recoveryCenterModal",
  ];
  const dom = Object.fromEntries(domKeys.map((key) => [key, new FakeTarget()]));
  const record = (name) => (...args) => calls.push([name, ...args]);
  const actions = new Proxy({}, { get: (_target, name) => record(String(name)) });
  const ui = {
    toggleRetirementTable: record("toggleRetirementTable"),
    populateTransactionSubcategoryOptions: record("populateTransactionSubcategoryOptions"),
  };
  const handlerNames = [
    "exportData", "triggerImport", "exportAndroMoney", "triggerAndroMoneyImport",
    "changeBalanceType", "cancelAndroMoneyImport", "confirmAndroMoneyImport", "syncAndroMoneyAccountChoice",
    "normalizeMoneyInput", "updateBudgetCap", "updateRetirementLinked", "runAuthAction", "retryCloudSync",
    "updateRetirementAge", "updateRetirementInput", "importJsonFile", "importAndroMoneyFile",
    "updateConnectivity", "toggleRetirementTable",
    "filterGoalCenter",
    "searchTransactions", "changeTransactionSearchPeriod", "clearTransactionSearch",
    "openRecoveryCenter", "closeRecoveryCenter", "restoreRecovery", "exportRecovery", "deleteRecovery", "reconcileAccount",
  ];
  const handlers = Object.fromEntries(handlerNames.map((name) => [name, record(name)]));
  return { calls, body, win, forms, doc, dom, actions, ui, handlers };
}

test("dispatchDataAction maps datasets to action, UI, and command boundaries", () => {
  const { calls, actions, ui, handlers } = createHarness();
  const dispatch = (action, dataset = {}) => dispatchDataAction({
    button: { dataset: { action, ...dataset } }, actions, ui, handlers,
  });

  assert.equal(dispatch("edit-bs", { id: "a1", isacc: "true" }), true);
  dispatch("mv-wish", { id: "w1", dir: "-1" });
  dispatch("preset-ret", { r: "8", i: "2.5" });
  dispatch("toggle-tbl");
  dispatch("export-data");
  dispatch("filter-goals", { filter: "considering" });
  dispatch("view-tx", { id: "tx-detail" });
  dispatch("view-budget-source", { id: "plan-fund", sourceType: "fund-plan" });
  dispatch("edit-transaction-detail");
  dispatch("save-transaction-detail");
  dispatch("cancel-transaction-detail-edit");
  dispatch("close-transaction-detail");
  dispatch("open-recovery-center");
  dispatch("restore-recovery", { id: "recovery-1" });
  dispatch("export-recovery", { id: "recovery-1" });
  dispatch("delete-recovery", { id: "recovery-1" });
  dispatch("close-recovery-center");
  dispatch("reconcile-account", { id: "card-1" });
  assert.equal(dispatch("unknown"), false);

  assert.deepEqual(calls, [
    ["beginEditBs", "a1", true],
    ["mvWish", "w1", -1],
    ["presetRet", 8, 2.5],
    ["toggleRetirementTable"],
    ["exportData"],
    ["filterGoalCenter", "considering"],
    ["openTransactionDetail", "tx-detail", { dataset: { action: "view-tx", id: "tx-detail" } }],
    ["openBudgetSourceDetail", "plan-fund", "fund-plan", { dataset: { action: "view-budget-source", id: "plan-fund", sourceType: "fund-plan" } }],
    ["editTransactionDetail"],
    ["saveTransactionDetail"],
    ["cancelTransactionDetailEdit"],
    ["closeTransactionDetail"],
    ["openRecoveryCenter"],
    ["restoreRecovery", "recovery-1"],
    ["exportRecovery", "recovery-1"],
    ["deleteRecovery", "recovery-1"],
    ["closeRecoveryCenter"],
    ["reconcileAccount", "card-1"],
  ]);
});

test("bindAppEvents delegates dynamic actions and preserves form validity", () => {
  const harness = createHarness();
  const { calls, body, forms } = harness;
  bindAppEvents(harness);

  const button = { dataset: { action: "del-tx", id: "tx-1" } };
  body.emit("click", { target: { closest: () => button } });
  const validEvent = forms["form-tx"].emit("submit");
  forms["form-fund"].valid = false;
  const invalidEvent = forms["form-fund"].emit("submit");

  assert.equal(validEvent.defaultPrevented, true);
  assert.equal(invalidEvent.defaultPrevented, true);
  assert.deepEqual(calls, [
    ["delTx", "tx-1"],
    ["addTx"],
    ["invalid", "form-fund"],
  ]);
});

test("bindAppEvents routes fixed inputs, files, auth, and connectivity once", () => {
  const harness = createHarness();
  const { calls, dom, win } = harness;
  bindAppEvents(harness);

  dom.filterPreset.value = "year";
  dom.filterPreset.emit("change");
  dom.inputCategory.emit("change");
  dom.transactionSearchQuery.emit("input");
  dom.transactionSearchPreset.emit("change");
  dom.transactionSearchClear.emit("click");
  dom.balanceType.value = "item";
  dom.balanceType.emit("change");
  dom.balanceAccountType.value = "liability";
  dom.balanceAccountType.emit("change");
  dom.inputAmount.value = "10.8";
  dom.inputAmount.emit("change");
  dom.budgetCapInput.emit("change");
  dom.txCancelButton.emit("click");
  dom.androMoneyConfirm.emit("click");
  dom.authButton.emit("click");
  dom.cloudStatus.emit("click");
  dom.transactionDetailModal.emit("click", { target: dom.transactionDetailModal });
  dom.transactionDetailModal.emit("change", { target: { id: "transaction-detail-type" } });
  dom.recoveryCenterModal.emit("click", { target: dom.recoveryCenterModal });
  const accountChoice = { matches: () => true };
  dom.androMoneyAccounts.emit("change", { target: accountChoice });
  harness.doc.emit("keydown", { key: "Escape" });
  harness.doc.emit("keydown", { key: "Tab" });
  dom.currentAge.emit("input");
  dom.retireAsset.emit("input");
  dom.fileImport.emit("change");
  dom.fileAndroMoneyImport.emit("change");
  win.emit("online");
  win.emit("offline");

  assert.deepEqual(calls.map(([name]) => name), [
    "setDatePreset",
    "populateTransactionSubcategoryOptions",
    "searchTransactions",
    "changeTransactionSearchPeriod",
    "clearTransactionSearch",
    "changeBalanceType",
    "changeBalanceType",
    "normalizeMoneyInput",
    "normalizeMoneyInput",
    "updateBudgetCap",
    "cancelEditTx",
    "confirmAndroMoneyImport",
    "runAuthAction",
    "retryCloudSync",
    "closeTransactionDetail",
    "syncTransactionDetailType",
    "closeRecoveryCenter",
    "syncAndroMoneyAccountChoice",
    "closeTransactionDetail",
    "closeRecoveryCenter",
    "trapTransactionDetailFocus",
    "updateRetirementAge",
    "updateRetirementInput",
    "importJsonFile",
    "importAndroMoneyFile",
    "updateConnectivity",
    "updateConnectivity",
  ]);
  assert.equal(calls[0][1], "year");
  assert.equal(calls.at(-2)[1], "online");
  assert.equal(calls.at(-1)[1], "offline");
});

test("unbind removes every registered listener and is idempotent", () => {
  const harness = createHarness();
  const unbind = bindAppEvents(harness);
  unbind();
  unbind();

  harness.dom.filterStart.emit("change");
  harness.dom.authButton.emit("click");
  harness.forms["form-wish"].emit("submit");
  harness.win.emit("offline");

  assert.deepEqual(harness.calls, []);
});
