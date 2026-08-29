import assert from "node:assert/strict";
import { test } from "node:test";
import { createTransactionDetailController } from "../src/app/controllers/transaction-detail-controller.js";

function createClassList(initial = ["d-none"]) {
  const values = new Set(initial);
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    toggle: (item, force) => force ? values.add(item) : values.delete(item),
    contains: (item) => values.has(item),
  };
}

function setup() {
  const doc = { activeElement: null };
  const first = { focus() { doc.activeElement = this; } };
  const last = { focus() { doc.activeElement = this; } };
  const modal = {
    classList: createClassList(),
    ownerDocument: doc,
    querySelectorAll: () => [first, last],
  };
  const title = { textContent: "" };
  const body = { innerHTML: "" };
  const remove = { classList: createClassList() };
  const edit = { classList: createClassList(), focused: false, focus() { this.focused = true; } };
  const close = { focused: false, focus() { this.focused = true; } };
  const trigger = { focused: false, focus() { this.focused = true; } };
  const state = {
    txs: [{
      id: "tx-1",
      type: "expense",
      amount: 440,
      date: "2026-08-01",
      category: "餐飲食品",
      subcategory: "午餐",
      acc: "cash",
      desc: "第一行\\n第二行 <script>",
      externalSource: "andromoney",
      linkedFundId: "fund-1",
    }],
    accounts: [{ id: "cash", name: "現金" }],
    sinkingFunds: [{
      id: "fund-1",
      name: "手機",
      category: "費用",
      monthlyContribution: 2000,
      targetAmount: 24000,
      startMonth: "2026-05",
      targetMonth: "2027-04",
      note: "換手機\\n保留預算",
      events: [{ id: "topup-1", type: "topup", amount: 1000, date: "2026-08-02", note: "臨時補入" }],
    }],
  };
  const deleted = [];
  const controller = createTransactionDetailController({
    elements: { modal, title, body, delete: remove, edit, close },
    store: { getState: () => state },
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    updateTransaction: async () => true,
    deleteTransaction: async (id) => { deleted.push(id); return true; },
  });
  return { controller, modal, title, body, remove, edit, close, trigger, doc, first, last, state, deleted };
}

test("opens a complete escaped transaction detail and restores focus when closed", () => {
  const fx = setup();
  assert.equal(fx.controller.openTransaction("tx-1", fx.trigger), true);
  assert.equal(fx.modal.classList.contains("d-none"), false);
  assert.equal(fx.title.textContent, "支出：餐飲食品 / 午餐");
  assert.match(fx.body.innerHTML, /NT\$ 440/);
  assert.match(fx.body.innerHTML, /AndroMoney 匯入/);
  assert.match(fx.body.innerHTML, /第一行\n第二行 &lt;script&gt;/);
  assert.doesNotMatch(fx.body.innerHTML, /<script>/);
  assert.equal(fx.close.focused, true);
  assert.equal(fx.edit.classList.contains("d-none"), false);
  assert.equal(fx.remove.classList.contains("d-none"), true);
  assert.equal(fx.controller.close(), true);
  assert.equal(fx.modal.classList.contains("d-none"), true);
  assert.equal(fx.trigger.focused, true);
});

test("balance adjustment detail offers a direct delete and closes after success", async () => {
  const fx = setup();
  fx.state.txs = [{
    id: "adjustment-1",
    type: "balance_adjustment",
    direction: "increase",
    amount: 1000,
    date: "2026-08-29",
    acc: "cash",
    category: "帳戶調整",
    subcategory: "對帳",
    desc: "對帳調整：現金",
  }];

  assert.equal(fx.controller.openTransaction("adjustment-1", fx.trigger), true);
  assert.equal(fx.edit.classList.contains("d-none"), true);
  assert.equal(fx.remove.classList.contains("d-none"), false);
  assert.equal(await fx.controller.removeActiveTransaction(), true);
  assert.deepEqual(fx.deleted, ["adjustment-1"]);
  assert.equal(fx.modal.classList.contains("d-none"), true);
  assert.equal(fx.trigger.focused, true);
});

test("opens fund plan and top-up source details without changing state", () => {
  const fx = setup();
  assert.equal(fx.controller.openBudgetSource("plan-fund-1", "fund-plan"), true);
  assert.equal(fx.title.textContent, "大額準備提撥明細");
  assert.match(fx.body.innerHTML, /每月提撥/);
  assert.match(fx.body.innerHTML, /NT\$ 2,000/);
  assert.equal(fx.edit.classList.contains("d-none"), true);
  fx.controller.close();

  assert.equal(fx.controller.openBudgetSource("topup-1", "fund-topup"), true);
  assert.equal(fx.title.textContent, "大額準備補入明細");
  assert.match(fx.body.innerHTML, /臨時補入/);
  assert.equal(fx.controller.openTransaction("missing"), false);
});

test("keeps keyboard focus inside the open detail dialog", () => {
  const fx = setup();
  fx.controller.openTransaction("tx-1");
  fx.doc.activeElement = fx.last;
  let prevented = false;
  assert.equal(fx.controller.trapFocus({ key: "Tab", preventDefault() { prevented = true; } }), true);
  assert.equal(prevented, true);
  assert.equal(fx.doc.activeElement, fx.first);

  fx.doc.activeElement = fx.first;
  assert.equal(fx.controller.trapFocus({ key: "Tab", shiftKey: true, preventDefault() {} }), true);
  assert.equal(fx.doc.activeElement, fx.last);
  fx.controller.close();
  assert.equal(fx.controller.trapFocus({ key: "Tab" }), false);
});

test("switches a transaction detail into an inline editor and can cancel", () => {
  const fx = setup();
  fx.controller.openTransaction("tx-1", fx.trigger);
  assert.equal(fx.controller.startEdit(), true);
  assert.match(fx.body.innerHTML, /transaction-detail-form/);
  assert.match(fx.body.innerHTML, /完整備註/);
  assert.equal(fx.title.textContent, "編輯交易");
  assert.equal(fx.edit.classList.contains("d-none"), true);
  assert.equal(fx.controller.cancelEdit(), true);
  assert.equal(fx.title.textContent, "支出：餐飲食品 \/ 午餐");
  assert.equal(fx.edit.classList.contains("d-none"), false);
});

test("editor exposes a selected fallback for a deleted account", () => {
  const fx = setup();
  fx.state.accounts = [];
  fx.controller.openTransaction("tx-1");
  fx.controller.startEdit();
  assert.match(fx.body.innerHTML, /value="cash" selected>已刪除帳戶（原紀錄）<\/option>/);
});

test("saving keeps the original transaction-row focus target", async () => {
  const fx = setup();
  fx.controller.openTransaction("tx-1", fx.trigger);
  fx.controller.startEdit();
  const values = {
    "#transaction-detail-type": "expense",
    "#transaction-detail-amount": "440",
    "#transaction-detail-date": "2026-08-01",
    "#transaction-detail-category": "餐飲食品",
    "#transaction-detail-subcategory": "午餐",
    "#transaction-detail-account": "cash",
    "#transaction-detail-from-account": "cash",
    "#transaction-detail-to-account": "cash",
    "#transaction-detail-person": "",
    "#transaction-detail-own-amount": "",
    "#transaction-detail-description": "修改後",
  };
  fx.body.querySelector = (selector) => selector === "#transaction-detail-form"
    ? { checkValidity: () => true }
    : selector in values ? { value: values[selector] } : null;

  assert.equal(await fx.controller.saveEdit(), true);
  fx.trigger.focused = false;
  fx.controller.close();
  assert.equal(fx.trigger.focused, true);
});

test("advance editor shows the amount already repaid", () => {
  const fx = setup();
  fx.state.txs = [
    { id: "advance-1", type: "advance", amount: 1000, ownAmount: 200, receivableAmount: 800, person: "朋友", date: "2026-08-01", category: "餐飲", subcategory: "聚餐", acc: "cash", desc: "代墊" },
    { id: "repay-1", type: "advance_repayment", advanceId: "advance-1", amount: 300, date: "2026-08-02", acc: "cash" },
  ];
  fx.controller.openTransaction("advance-1");
  fx.controller.startEdit();
  assert.match(fx.body.innerHTML, /目前已收回 NT\$ 300/);
  assert.match(fx.body.innerHTML, /不能改成其他交易類型/);
});
