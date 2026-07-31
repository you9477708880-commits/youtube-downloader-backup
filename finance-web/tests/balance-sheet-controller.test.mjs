import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../src/state/store.js";
import { createBalanceSheetController } from "../src/app/controllers/balance-sheet-controller.js";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle(name, force) {
      if (force === undefined) {
        if (values.has(name)) values.delete(name);
        else values.add(name);
        return values.has(name);
      }
      if (force) values.add(name);
      else values.delete(name);
      return force;
    },
    contains: (name) => values.has(name),
  };
}

function createHarness() {
  const store = createStore({
    accounts: [
      { id: "cash", name: "現金", type: "asset", initialBalance: 1000, isEm: false },
      { id: "card", name: "信用卡", type: "liability", initialBalance: -500, isEm: false },
    ],
    bsI: [{ id: "manual-1", name: "股票", amount: 3000, cat: "asset", isEm: false }],
    txs: [{ id: "tx-1", type: "expense", amount: 100, acc: "cash" }],
  });
  const calls = {
    save: 0,
    render: 0,
    navigate: [],
    editModes: [],
    toasts: [],
    scroll: 0,
    confirm: true,
    nextId: 0,
  };
  const dom = {
    balanceName: { value: "" },
    balanceType: { value: "account" },
    balanceCategoryWrap: { classList: createClassList(["d-none"]) },
    balanceCategory: { value: "asset" },
    balanceAmount: { value: "" },
    balanceEmergency: { checked: false },
    root: {
      getElementById: (id) => id === "form-bs"
        ? { scrollIntoView: () => { calls.scroll += 1; } }
        : null,
    },
  };
  const ui = {
    setBalanceSheetEditMode: (value) => calls.editModes.push(value),
    toast: {
      show: (...args) => calls.toasts.push(args),
    },
  };
  const controller = createBalanceSheetController({
    elements: {
      root: dom.root,
      name: dom.balanceName,
      type: dom.balanceType,
      categoryWrap: dom.balanceCategoryWrap,
      category: dom.balanceCategory,
      amount: dom.balanceAmount,
      emergency: dom.balanceEmergency,
    },
    store,
    toast: ui.toast,
    setEditMode: ui.setBalanceSheetEditMode,
    saveState: () => { calls.save += 1; },
    renderAll: () => { calls.render += 1; },
    navigate: (tabId) => calls.navigate.push(tabId),
    confirmDelete: () => calls.confirm,
    createId: (prefix) => `${prefix}-test-${++calls.nextId}`,
  });
  return { store, calls, dom, controller };
}

test("adds accounts and manual balance-sheet items with one save and render each", () => {
  const { store, calls, dom, controller } = createHarness();

  dom.balanceName.value = "銀行";
  dom.balanceAmount.value = "2500";
  dom.balanceEmergency.checked = true;
  controller.addBs();

  const addedAccount = store.getState().accounts.at(-1);
  assert.match(addedAccount.id, /^a-/);
  assert.deepEqual(
    { name: addedAccount.name, type: addedAccount.type, initialBalance: addedAccount.initialBalance, isEm: addedAccount.isEm },
    { name: "銀行", type: "asset", initialBalance: 2500, isEm: true },
  );

  dom.balanceType.value = "item";
  dom.balanceName.value = "車貸";
  dom.balanceAmount.value = "9000";
  dom.balanceCategory.value = "liability";
  controller.addBs();

  const addedItem = store.getState().bsI.at(-1);
  assert.match(addedItem.id, /^bs-/);
  assert.deepEqual(
    { name: addedItem.name, amount: addedItem.amount, cat: addedItem.cat, isEm: addedItem.isEm },
    { name: "車貸", amount: 9000, cat: "liability", isEm: false },
  );
  assert.equal(calls.save, 2);
  assert.equal(calls.render, 2);
});

test("edits accounts without changing identity, type, or historical transactions", () => {
  const { store, calls, dom, controller } = createHarness();
  const originalTransactions = structuredClone(store.getState().txs);

  controller.beginEditBs("card", true);
  assert.deepEqual(calls.navigate, ["bs"]);
  assert.equal(dom.balanceName.value, "信用卡");
  assert.equal(dom.balanceAmount.value, -500);
  assert.equal(dom.balanceCategoryWrap.classList.contains("d-none"), true);
  assert.equal(calls.scroll, 1);

  dom.balanceType.value = "item";
  dom.balanceName.value = "主要信用卡";
  dom.balanceAmount.value = "1200";
  dom.balanceEmergency.checked = true;
  controller.addBs();

  const edited = store.getState().accounts.find((item) => item.id === "card");
  assert.deepEqual(edited, {
    id: "card",
    name: "主要信用卡",
    type: "liability",
    initialBalance: 1200,
    isEm: true,
  });
  assert.deepEqual(store.getState().txs, originalTransactions);
  assert.equal(store.getState().bsI.length, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
});

test("edits manual items in place and allows category changes", () => {
  const { store, calls, dom, controller } = createHarness();

  controller.beginEditBs("manual-1", false);
  assert.equal(dom.balanceCategoryWrap.classList.contains("d-none"), false);
  assert.equal(dom.balanceCategory.value, "asset");

  dom.balanceName.value = "證券借款";
  dom.balanceAmount.value = "4500";
  dom.balanceCategory.value = "liability";
  dom.balanceEmergency.checked = true;
  controller.addBs();

  assert.deepEqual(store.getState().bsI[0], {
    id: "manual-1",
    name: "證券借款",
    amount: 4500,
    cat: "liability",
    isEm: true,
  });
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
});

test("validation failure and cancelled deletion leave state unchanged", () => {
  const { store, calls, dom, controller } = createHarness();
  const original = structuredClone(store.getState());

  dom.balanceAmount.value = "-1";
  controller.addBs();
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.toasts.at(-1)[1], "error");

  calls.confirm = false;
  controller.delBs("cash", true);
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
});

test("zero remains a valid amount and missing edit targets have no side effects", () => {
  const { store, calls, dom, controller } = createHarness();

  controller.beginEditBs("missing", false);
  assert.deepEqual(calls.navigate, []);
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.toasts.at(-1)[1], "error");

  dom.balanceName.value = "零餘額帳戶";
  dom.balanceAmount.value = "0";
  controller.addBs();
  assert.equal(store.getState().accounts.at(-1).initialBalance, 0);
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
});

test("delete and emergency toggle preserve unrelated collections and save once", () => {
  const { store, calls, controller } = createHarness();
  const originalTransactions = structuredClone(store.getState().txs);

  controller.toggleEm("manual-1", false);
  assert.equal(store.getState().bsI[0].isEm, true);
  assert.deepEqual(store.getState().txs, originalTransactions);
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);

  controller.delBs("cash", true);
  assert.equal(store.getState().accounts.some((item) => item.id === "cash"), false);
  assert.deepEqual(store.getState().txs, originalTransactions);
  assert.equal(calls.save, 2);
  assert.equal(calls.render, 2);
});

test("cancel and reset clear edit state without saving", () => {
  const { calls, dom, controller } = createHarness();

  controller.beginEditBs("manual-1", false);
  controller.cancelEditBs();
  assert.equal(dom.balanceName.value, "");
  assert.equal(dom.balanceType.value, "account");
  assert.equal(dom.balanceCategoryWrap.classList.contains("d-none"), true);
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);

  controller.beginEditBs("manual-1", false);
  controller.reset();
  assert.equal(dom.balanceName.value, "");
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
});

test("reset clears the editing identity so the next submit creates a new item", () => {
  const { store, calls, dom, controller } = createHarness();

  controller.beginEditBs("manual-1", false);
  controller.reset();
  dom.balanceType.value = "item";
  dom.balanceName.value = "新項目";
  dom.balanceAmount.value = "600";
  dom.balanceCategory.value = "asset";
  controller.addBs();

  assert.equal(store.getState().bsI.length, 2);
  assert.equal(store.getState().bsI[0].name, "股票");
  assert.equal(store.getState().bsI[1].name, "新項目");
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
});
