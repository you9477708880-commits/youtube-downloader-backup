import { getOpenAdvances } from "./transactions.js";

export const DELETED_ACCOUNT_FALLBACK_ID = "deleted_account_fallback";

export function getAccountTransactionDelta(tx, accountId) {
  if (tx.type === "transfer") {
    if (String(tx.fromAcc) === String(accountId)) return -tx.amount;
    if (String(tx.toAcc) === String(accountId)) return tx.amount;
    return 0;
  }
  if (String(tx.acc) !== String(accountId)) return 0;
  if (tx.type === "income" || tx.type === "advance_repayment") return tx.amount;
  if (tx.type === "expense" || tx.type === "advance") return -tx.amount;
  if (tx.type === "balance_adjustment") return tx.direction === "increase" ? tx.amount : -tx.amount;
  return 0;
}

export function calculateAccountBalances(state) {
  const balances = {};
  state.accounts.forEach((account) => {
    balances[account.id] = account.initialBalance || 0;
  });

  const addToAccount = (accountId, amount) => {
    const targetId = balances[accountId] === undefined ? DELETED_ACCOUNT_FALLBACK_ID : accountId;
    balances[targetId] = (balances[targetId] || 0) + amount;
  };

  state.txs.forEach((tx) => {
    if (tx.type === "transfer") {
      addToAccount(tx.fromAcc, getAccountTransactionDelta(tx, tx.fromAcc));
      addToAccount(tx.toAcc, getAccountTransactionDelta(tx, tx.toAcc));
      return;
    }
    if (tx.acc !== undefined && tx.acc !== null && tx.acc !== "") {
      addToAccount(tx.acc, getAccountTransactionDelta(tx, tx.acc));
    }
  });

  return balances;
}

export function calculateBalanceSheet(state) {
  const balances = calculateAccountBalances(state);
  const assets = state.bsI.filter((item) => item.cat === "asset");
  const liabilities = state.bsI.filter((item) => item.cat === "liability");
  const receivables = getOpenAdvances(state.txs);
  const receivableTotal = receivables.reduce((sum, tx) => sum + tx.outstandingAmount, 0);
  const fallbackBalance = balances[DELETED_ACCOUNT_FALLBACK_ID] || 0;

  const totalAssets =
    assets.reduce((sum, item) => sum + item.amount, 0) +
    state.accounts.reduce((sum, account) => sum + (balances[account.id] > 0 ? balances[account.id] : 0), 0) +
    (fallbackBalance > 0 ? fallbackBalance : 0) +
    receivableTotal;

  const totalLiabilities =
    liabilities.reduce((sum, item) => sum + item.amount, 0) +
    state.accounts.reduce((sum, account) => sum + (balances[account.id] < 0 ? -balances[account.id] : 0), 0) +
    (fallbackBalance < 0 ? -fallbackBalance : 0);

  return {
    balances,
    assets,
    liabilities,
    receivables,
    receivableTotal,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
