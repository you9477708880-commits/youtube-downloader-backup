import { compareTransactionsByDateDesc } from "../domain/transactions.js";
import { getTransactionAccountIds, renderTransactionDetailList } from "./transaction-detail-view.js";
import { DEFAULT_PAGE_SIZE, focusListPageControl, paginateList, renderListPagination } from "./list-pagination.js";
import { activeAccounts } from "../domain/account-status.js";

const accountViews = new WeakMap();

export function resetAccountHistory(container) {
  const view = accountViews.get(container);
  if (view) {
    container.removeEventListener?.("toggle", view.handleToggle, true);
    container.removeEventListener?.("click", view.handlePage);
  }
  accountViews.delete(container);
}

// Keep ephemeral expansion, paging and unfinished reconciliation input outside state.
export function prepareAccountHistory({ container, state, utils, pageSize = DEFAULT_PAGE_SIZE }) {
  let view = accountViews.get(container);
  const openAccounts = new Set();
  const openHistories = new Set();
  const drafts = new Map();
  let focusedAccount = null;
  const getInputKey = (node) => node.dataset.accountKey ?? node.dataset.reconcileInput;
  if (view) {
    for (const node of container.querySelectorAll?.("[data-account-card]") || []) {
      if (node.open) openAccounts.add(node.dataset.accountKey);
    }
    for (const node of container.querySelectorAll?.("[data-account-transactions]") || []) {
      if (node.open) openHistories.add(node.dataset.accountKey);
    }
    for (const node of container.querySelectorAll?.("[data-reconcile-input]") || []) {
      drafts.set(getInputKey(node), node.value);
      if (container.ownerDocument?.activeElement === node) focusedAccount = getInputKey(node);
    }
  } else {
    view = { pages: new Map() };
    view.handleToggle = (event) => {
      const node = event.target;
      if (!container.contains(node)) return;
      if (node.matches?.("[data-account-transactions]")) view.fillHistory(node);
      else if (node.matches?.("[data-account-card]")) {
        const history = node.querySelector("[data-account-transactions]");
        if (history) view.fillHistory(history);
      }
    };
    view.handlePage = (event) => {
      const button = event.target.closest?.("[data-list-page]");
      if (!button || !container.contains(button) || button.disabled) return;
      const history = button.closest("[data-account-transactions]");
      if (!history) return;
      const id = history.dataset.accountKey;
      const direction = button.dataset.listPage;
      view.pages.set(id, (view.pages.get(id) || 0) + (direction === "next" ? 1 : -1));
      view.fillHistory(history);
      focusListPageControl(history, direction);
    };
    container.addEventListener?.("toggle", view.handleToggle, true);
    container.addEventListener?.("click", view.handlePage);
    accountViews.set(container, view);
  }

  const accountNames = new Map();
  const occurrences = new Map();
  const accountIdsByKey = new Map();
  const accountKeys = activeAccounts(state.accounts).map((account) => {
    if (!accountNames.has(account.id)) accountNames.set(account.id, account.name);
    const occurrence = occurrences.get(account.id) || 0;
    occurrences.set(account.id, occurrence + 1);
    const key = JSON.stringify([typeof account.id, account.id, occurrence]);
    accountIdsByKey.set(key, account.id);
    return key;
  });
  for (const account of state.accounts) if (!accountNames.has(account.id)) accountNames.set(account.id, account.name);
  for (const id of view.pages.keys()) if (!accountIdsByKey.has(id)) view.pages.delete(id);
  let transactionsByAccount = null;
  const sortedAccounts = new Set();
  const getTransactions = (id) => {
    if (!transactionsByAccount) {
      transactionsByAccount = new Map();
      for (const tx of state.txs) {
        for (const accountId of new Set(getTransactionAccountIds(tx))) {
          if (!transactionsByAccount.has(accountId)) transactionsByAccount.set(accountId, []);
          transactionsByAccount.get(accountId).push(tx);
        }
      }
    }
    const transactions = transactionsByAccount.get(id) || [];
    if (!sortedAccounts.has(id)) {
      transactions.sort(compareTransactionsByDateDesc);
      sortedAccounts.add(id);
    }
    return transactions;
  };
  view.fillHistory = (history) => {
    const target = history.querySelector("[data-account-history]");
    if (!target) return;
    if (!history.open || !history.closest("[data-account-card]")?.open) {
      target.innerHTML = "";
      return;
    }
    const id = history.dataset.accountKey;
    if (!accountIdsByKey.has(id)) return;
    const rawAccountId = accountIdsByKey.get(id);
    const pagination = paginateList(getTransactions(rawAccountId), view.pages.get(id), pageSize);
    view.pages.set(id, pagination.page);
    target.innerHTML = renderListPagination(pagination) + renderTransactionDetailList({
      txs: pagination.items,
      utils,
      getAccountName: (accountId) => accountNames.get(accountId) || "未知帳戶",
      accountId: rawAccountId,
    });
  };

  return {
    openAccounts,
    openHistories,
    accountKeys,
    restore() {
      for (const node of container.querySelectorAll?.("[data-reconcile-input]") || []) {
        if (drafts.has(getInputKey(node))) node.value = drafts.get(getInputKey(node));
        if (focusedAccount === getInputKey(node)) node.focus?.({ preventScroll: true });
      }
      for (const node of container.querySelectorAll?.("[data-account-transactions]") || []) view.fillHistory(node);
    },
  };
}
