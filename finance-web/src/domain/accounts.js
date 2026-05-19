import { getOpenAdvances } from "./transactions.js";

export const DELETED_ACCOUNT_FALLBACK_ID = "deleted_account_fallback";

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
    if (tx.type === "income") addToAccount(tx.acc, tx.amount);
    if (tx.type === "expense") addToAccount(tx.acc, -tx.amount);
    if (tx.type === "advance") addToAccount(tx.acc, -tx.amount);
    if (tx.type === "advance_repayment") addToAccount(tx.acc, tx.amount);
    if (tx.type === "transfer") {
      addToAccount(tx.fromAcc, -tx.amount);
      addToAccount(tx.toAcc, tx.amount);
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
