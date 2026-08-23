import assert from "node:assert/strict";
import { test } from "node:test";
import { createTransactionDetailController } from "../src/app/controllers/transaction-detail-controller.js";

function createClassList(initial = ["d-none"]) {
  const values = new Set(initial);
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
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
  const controller = createTransactionDetailController({
    elements: { modal, title, body, close },
    store: { getState: () => state },
    formatMoney: (value) => `NT$ ${Number(value).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  });
  return { controller, modal, title, body, close, trigger, doc, first, last };
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
  assert.equal(fx.controller.close(), true);
  assert.equal(fx.modal.classList.contains("d-none"), true);
  assert.equal(fx.trigger.focused, true);
});

test("opens fund plan and top-up source details without changing state", () => {
  const fx = setup();
  assert.equal(fx.controller.openBudgetSource("plan-fund-1", "fund-plan"), true);
  assert.equal(fx.title.textContent, "大額準備提撥明細");
  assert.match(fx.body.innerHTML, /每月提撥/);
  assert.match(fx.body.innerHTML, /NT\$ 2,000/);
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
