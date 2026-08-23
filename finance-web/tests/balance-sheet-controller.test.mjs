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
    commit: 0,
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
    balanceAccountFields: { classList: createClassList() },
    balanceAccountType: { value: "asset" },
    balanceCreditFields: { classList: createClassList(["d-none"]) },
    balanceCreditLimit: { value: "" },
    balanceStatementDay: { value: "" },
    balancePaymentDueDay: { value: "" },
    balanceAmount: { value: "", min: "" },
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
      accountFields: dom.balanceAccountFields,
      accountType: dom.balanceAccountType,
      creditFields: dom.balanceCreditFields,
      creditLimit: dom.balanceCreditLimit,
      statementDay: dom.balanceStatementDay,
      paymentDueDay: dom.balancePaymentDueDay,
      amount: dom.balanceAmount,
      emergency: dom.balanceEmergency,
    },
    store,
    toast: ui.toast,
    setEditMode: ui.setBalanceSheetEditMode,
    commitState: (mutator, { updateUi }) => {
      calls.commit += 1;
      calls.save += 1;
      store.update(mutator);
      updateUi(store.getState());
    },
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
  assert.equal(calls.commit, 2);
  assert.equal(calls.render, 2);
});

test("edits account identity-safe settings without changing historical transactions", () => {
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
    creditLimit: 0,
    statementDay: 0,
    paymentDueDay: 0,
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

  dom.balanceType.value = "item";
  dom.balanceAmount.value = "-1";
  controller.addBs();
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.commit, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.toasts.at(-1)[1], "error");

  calls.confirm = false;
  controller.delBs("cash", true);
  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
});

test("creates and edits credit-card scheduling settings while preserving account ID", () => {
  const { store, calls, dom, controller } = createHarness();
  dom.balanceName.value = "玉山信用卡";
  dom.balanceAccountType.value = "liability";
  dom.balanceCreditLimit.value = "120000";
  dom.balanceStatementDay.value = "5";
  dom.balancePaymentDueDay.value = "23";
  dom.balanceAmount.value = "-3000";
  controller.addBs();

  const card = store.getState().accounts.at(-1);
  assert.equal(card.type, "liability");
  assert.equal(card.initialBalance, -3000);
  assert.equal(card.creditLimit, 120000);
  assert.equal(card.statementDay, 5);
  assert.equal(card.paymentDueDay, 23);

  controller.beginEditBs(card.id, true);
  assert.equal(dom.balanceAccountType.value, "liability");
  assert.equal(dom.balanceCreditFields.classList.contains("d-none"), false);
  dom.balanceCreditLimit.value = "150000";
  controller.addBs();
  assert.equal(store.getState().accounts.at(-1).id, card.id);
  assert.equal(store.getState().accounts.at(-1).creditLimit, 150000);
  assert.equal(calls.save, 2);
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

test("deletes numeric legacy account IDs when the DOM provides a string ID", () => {
  const { store, calls, controller } = createHarness();
  store.update((draft) => {
    draft.accounts.push({
      id: 42,
      name: "舊資料帳戶",
      type: "asset",
      initialBalance: 800,
      isEm: false,
    });
  });

  controller.delBs("42", true);

  assert.equal(store.getState().accounts.some((item) => item.id === 42), false);
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
});

test("deleting the item being edited clears stale edit state before the next submit", () => {
  const { store, calls, dom, controller } = createHarness();

  controller.beginEditBs("manual-1", false);
  controller.delBs("manual-1", false);
  dom.balanceType.value = "item";
  dom.balanceName.value = "刪除後的新項目";
  dom.balanceAmount.value = "700";
  dom.balanceCategory.value = "asset";
  controller.addBs();

  assert.equal(store.getState().bsI.length, 1);
  assert.equal(store.getState().bsI[0].name, "刪除後的新項目");
  assert.match(store.getState().bsI[0].id, /^bs-/);
  assert.equal(calls.save, 2);
  assert.equal(calls.render, 2);
  assert.equal(calls.toasts.at(-1)[0], "已新增資產 / 負債項目");
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
