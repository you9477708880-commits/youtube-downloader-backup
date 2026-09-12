import assert from "node:assert/strict";
import { test } from "node:test";
import { renderLedger, resetLedgerView } from "../src/views/ledger-view.js";
import { refreshAccountOptions } from "../src/views/account-options-view.js";
import { prepareAccountHistory, resetAccountHistory } from "../src/views/account-history-view.js";
import { renderBalanceSheet } from "../src/views/balance-sheet-view.js";
import { paginateList } from "../src/views/list-pagination.js";

const utils = { formatMoney: (value) => `NT$ ${value}`, escapeHTML: (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;") };
const constants = { days: ["日", "一", "二", "三", "四", "五", "六"], transactionIcons: {} };
const makeTransactions = (count) => Array.from({ length: count }, (_, index) => ({ id: `tx-${String(index).padStart(4, "0")}`, type: "expense", amount: 1, date: "2026-09-01", desc: `note-${index}`, acc: "cash", cat: "餐飲" }));
const makeState = (txs) => ({ txs, accounts: [{ id: "cash", name: "現金", type: "asset", initialBalance: 1000 }], sinkingFunds: [], bsI: [], settings: {} });

function container() {
  const listeners = new Map();
  return {
    innerHTML: "", textContent: "", nodes: {}, listeners,
    addEventListener(type, listener) { assert.equal(listeners.has(type), false, `duplicate ${type} listener`); listeners.set(type, listener); },
    removeEventListener(type, listener) { assert.equal(listeners.get(type), listener); listeners.delete(type); },
    contains: () => true,
    querySelector: () => null,
    querySelectorAll(selector) { return this.nodes[selector] || []; },
    emit(type, target) { listeners.get(type)?.({ target }); },
  };
}

function pageButton(direction, history = null) {
  const button = { dataset: { listPage: direction }, disabled: false };
  button.closest = (selector) => selector === "[data-account-transactions]" ? history : button;
  return button;
}

test("ledger pages only visible rows while counts and date totals use all matches", () => {
  const state = makeState(makeTransactions(125));
  const before = JSON.stringify(state);
  const dom = { advList: container(), oTx: container(), aTx: container(), txCount: container() };
  const args = { state, filteredTxs: state.txs, constants, utils, dom, paginationKey: "report:september" };
  renderLedger(args);
  assert.equal((dom.aTx.innerHTML.match(/class="tx-row"/g) || []).length, 50);
  assert.equal(dom.txCount.textContent, "125 筆");
  assert.match(dom.aTx.innerHTML, /-NT\$ 125/);
  assert.match(dom.aTx.innerHTML, /data-id="tx-0124"/);
  assert.doesNotMatch(dom.aTx.innerHTML, /data-id="tx-0000"/);
  const overview = dom.oTx.innerHTML;
  dom.aTx.emit("click", pageButton("next"));
  assert.match(dom.aTx.innerHTML, /顯示 51–100 筆/);
  assert.equal(dom.oTx.innerHTML, overview);
  renderLedger({ ...args, state: structuredClone(state) });
  assert.match(dom.aTx.innerHTML, /顯示 51–100 筆/);
  dom.aTx.emit("click", pageButton("next"));
  assert.equal((dom.aTx.innerHTML.match(/class="tx-row"/g) || []).length, 25);
  assert.match(dom.aTx.innerHTML, /data-id="tx-0000"/);
  renderLedger({ ...args, filteredTxs: state.txs.slice(0, 51) });
  assert.match(dom.aTx.innerHTML, /顯示 51–51 筆/);
  renderLedger({ ...args, paginationKey: "search:coffee" });
  assert.match(dom.aTx.innerHTML, /顯示 1–50 筆/);
  dom.aTx.emit("click", pageButton("next"));
  resetLedgerView(dom);
  assert.equal(dom.aTx.listeners.size, 0);
  renderLedger(args);
  assert.match(dom.aTx.innerHTML, /顯示 1–50 筆/);
  assert.equal(JSON.stringify(state), before);
});

test("account dropdown avoids rewrites and keeps a surviving selection, with explicit scope reset", () => {
  let writes = 0;
  const node = { value: "bank", set innerHTML(value) { writes++; this.html = value; this.value = "cash"; } };
  const state = makeState([]);
  state.accounts.push({ id: "bank", name: '銀行"<', type: "asset" });
  const args = { state, utils, root: { querySelectorAll: () => [node] } };
  refreshAccountOptions(args);
  assert.equal(node.value, "bank");
  assert.match(node.html, /銀行&quot;&lt;/);
  refreshAccountOptions(args);
  assert.equal(writes, 1);
  state.accounts[1].name = "銀行新名稱";
  refreshAccountOptions(args);
  assert.equal(node.value, "bank");
  assert.equal(writes, 2);
  refreshAccountOptions({ ...args, force: true });
  assert.equal(node.value, "cash");
  state.accounts.pop();
  refreshAccountOptions(args);
  assert.equal(node.value, "cash");
});

test("ledger search changes only its result list, keeping report recent transactions", () => {
  const state = makeState(makeTransactions(3));
  const dom = { advList: container(), oTx: container(), aTx: container(), txCount: container() };
  renderLedger({ state, filteredTxs: [state.txs[2]], reportTxs: [state.txs[0]], constants, utils, dom });
  assert.match(dom.aTx.innerHTML, /data-id="tx-0002"/);
  assert.doesNotMatch(dom.oTx.innerHTML, /data-id="tx-0002"/);
  assert.match(dom.oTx.innerHTML, /data-id="tx-0000"/);
});

function historyHarness() {
  const target = container();
  const accountKey = JSON.stringify(["string", "cash", 0]);
  const card = { open: false, dataset: { accountCard: "cash", accountKey }, matches: (selector) => selector === "[data-account-card]", querySelector: () => history };
  const history = {
    open: false, dataset: { accountTransactions: "cash", accountKey },
    matches: (selector) => selector === "[data-account-transactions]",
    closest: () => card,
    querySelector: (selector) => selector === "[data-account-history]" ? target : null,
  };
  const root = container();
  root.nodes = { "[data-account-card]": [card], "[data-account-transactions]": [history], "[data-reconcile-input]": [] };
  return { root, card, history, target };
}

test("account history is lazy, bounded and refreshes open pages with current transactions", () => {
  const { root, card, history, target } = historyHarness();
  const state = makeState(makeTransactions(125));
  const before = JSON.stringify(state);
  let view = prepareAccountHistory({ container: root, state, utils });
  view.restore();
  assert.equal(target.innerHTML, "");
  card.open = true;
  root.emit("toggle", card);
  assert.equal(target.innerHTML, "");
  history.open = true;
  root.emit("toggle", history);
  assert.equal((target.innerHTML.match(/data-action="view-tx"/g) || []).length, 50);
  root.emit("click", pageButton("next", history));
  assert.match(target.innerHTML, /顯示 51–100 筆/);
  const replacement = structuredClone(state);
  replacement.txs[74].desc = "updated-note";
  view = prepareAccountHistory({ container: root, state: replacement, utils });
  assert.equal(view.openAccounts.has(card.dataset.accountKey), true);
  assert.equal(view.openHistories.has(history.dataset.accountKey), true);
  view.restore();
  assert.match(target.innerHTML, /顯示 51–100 筆/);
  assert.match(target.innerHTML, /updated-note/);
  card.open = false;
  root.emit("toggle", card);
  assert.equal(target.innerHTML, "");
  card.open = true;
  root.emit("toggle", card);
  assert.match(target.innerHTML, /顯示 51–100 筆/);
  resetAccountHistory(root);
  assert.equal(root.listeners.size, 0);
  view = prepareAccountHistory({ container: root, state, utils });
  assert.equal(view.openAccounts.size, 0);
  assert.equal(view.openHistories.size, 0);
  // The owning view recreates closed details after a whole-state replacement.
  card.open = false;
  history.open = false;
  view.restore();
  card.open = true;
  history.open = true;
  root.emit("toggle", history);
  assert.match(target.innerHTML, /顯示 1–50 筆/);
  assert.equal(JSON.stringify(state), before);
});

test("account history preserves unfinished reconciliation input and focus across rerender", () => {
  const { root } = historyHarness();
  const state = makeState([]);
  prepareAccountHistory({ container: root, state, utils });
  const oldInput = { dataset: { reconcileInput: "cash" }, value: "-1250" };
  root.nodes["[data-reconcile-input]"] = [oldInput];
  root.ownerDocument = { activeElement: oldInput };
  const view = prepareAccountHistory({ container: root, state, utils });
  let focused = false;
  const newInput = { dataset: { reconcileInput: "cash" }, value: "", focus: () => { focused = true; } };
  root.nodes["[data-reconcile-input]"] = [newInput];
  view.restore();
  assert.equal(newInput.value, "-1250");
  assert.equal(focused, true);
});

test("collapsed balance sheet account cards contain no transaction detail markup", () => {
  const state = makeState(makeTransactions(125));
  const dom = { accountCenter: container(), balanceSheetBody: container() };
  renderBalanceSheet({ state, utils, dom });
  assert.match(dom.accountCenter.innerHTML, /查看相關交易（125）/);
  assert.match(dom.accountCenter.innerHTML, /data-action="reconcile-account"/);
  assert.doesNotMatch(dom.accountCenter.innerHTML, /data-action="view-tx"/);
});

test("page slicing clamps after deletion and supports a configurable size", () => {
  assert.deepEqual(paginateList([1, 2, 3, 4, 5], 3, 2), { items: [5], page: 2, pageCount: 3, total: 5, start: 5, end: 5 });
  assert.equal(paginateList([], 9).page, 0);
  assert.equal(paginateList([1], -1, 0).page, 0);
});

test("account history keeps raw numeric and string account membership distinct", () => {
  const { root, card, history, target } = historyHarness();
  const state = makeState([
    { ...makeTransactions(1)[0], id: "numeric-account-tx", acc: 7, amount: 7 },
    { ...makeTransactions(1)[0], id: "string-account-tx", acc: "7", amount: 8 },
    { id: "numeric-transfer", type: "transfer", fromAcc: 7, toAcc: "7", amount: 3, date: "2026-09-01" },
  ]);
  state.accounts = [{ id: 7, name: "數字帳戶" }, { id: "7", name: "字串帳戶" }];
  const view = prepareAccountHistory({ container: root, state, utils });
  card.open = true;
  history.open = true;
  history.dataset.accountKey = view.accountKeys[0];
  root.emit("toggle", history);
  assert.match(target.innerHTML, /numeric-account-tx/);
  assert.doesNotMatch(target.innerHTML, /string-account-tx/);
  assert.match(target.innerHTML, /-NT\$ 7/);
  assert.match(target.innerHTML, /-NT\$ 3/);
  history.dataset.accountKey = view.accountKeys[1];
  root.emit("toggle", history);
  assert.match(target.innerHTML, /string-account-tx/);
  assert.doesNotMatch(target.innerHTML, /numeric-account-tx/);
  assert.match(target.innerHTML, /-NT\$ 8/);
  assert.match(target.innerHTML, /\+NT\$ 3/);
  assert.notEqual(view.accountKeys[0], view.accountKeys[1]);
});

test("ledger and history names keep first matching account when IDs are duplicated", () => {
  const state = makeState([{ ...makeTransactions(1)[0], desc: "" }]);
  state.accounts = [{ id: "cash", name: "第一筆帳戶" }, { id: "cash", name: "第二筆帳戶" }];
  const dom = { advList: container(), oTx: container(), aTx: container(), txCount: container() };
  renderLedger({ state, filteredTxs: state.txs, constants, utils, dom });
  assert.match(dom.aTx.innerHTML, /第一筆帳戶/);
  assert.doesNotMatch(dom.aTx.innerHTML, /第二筆帳戶/);
  const { root, card, history, target } = historyHarness();
  const view = prepareAccountHistory({ container: root, state, utils });
  card.open = true;
  history.open = true;
  history.dataset.accountKey = view.accountKeys[1];
  root.emit("toggle", history);
  assert.match(target.innerHTML, /第一筆帳戶/);
  assert.doesNotMatch(target.innerHTML, /第二筆帳戶/);
  assert.notEqual(view.accountKeys[0], view.accountKeys[1]);
});

test("same-ID advances keep their individual receivable limit when rendering repay controls", () => {
  const state = makeState([
    { ...makeTransactions(1)[0], id: "duplicate-advance", type: "advance", desc: "fully-repaid", amount: 15, ownAmount: 5, receivableAmount: 10 },
    { ...makeTransactions(1)[0], id: "duplicate-advance", type: "advance", desc: "still-outstanding", amount: 30, ownAmount: 10, receivableAmount: 20 },
    { id: "repayment", type: "advance_repayment", advanceId: "duplicate-advance", amount: 10, date: "2026-09-01", acc: "cash" },
  ]);
  const dom = { advList: container(), oTx: container(), aTx: container(), txCount: container() };
  renderLedger({ state, filteredTxs: state.txs, constants, utils, dom });
  const rows = dom.aTx.innerHTML.split('<div class="tx-row">').slice(1);
  const closed = rows.find((row) => row.includes("應收 NT$ 10"));
  const open = rows.find((row) => row.includes("應收 NT$ 20"));
  assert.ok(closed && open);
  assert.doesNotMatch(closed, /data-action="repay-advance"/);
  assert.match(open, /data-action="repay-advance"/);
});

test("duplicate account cards preserve distinct reconciliation drafts and focus", () => {
  const { root } = historyHarness();
  const state = makeState([]);
  state.accounts.push({ ...state.accounts[0], name: "第二張卡" });
  const initial = prepareAccountHistory({ container: root, state, utils });
  const oldInputs = initial.accountKeys.map((accountKey, index) => ({ dataset: { accountKey, reconcileInput: "cash" }, value: String(100 + index) }));
  root.nodes["[data-reconcile-input]"] = oldInputs;
  root.ownerDocument = { activeElement: oldInputs[1] };
  const view = prepareAccountHistory({ container: root, state, utils });
  const focused = [];
  const replacements = initial.accountKeys.map((accountKey, index) => ({ dataset: { accountKey, reconcileInput: "cash" }, value: "", focus: () => focused.push(index) }));
  root.nodes["[data-reconcile-input]"] = replacements;
  view.restore();
  assert.deepEqual(replacements.map((node) => node.value), ["100", "101"]);
  assert.deepEqual(focused, [1]);
});
