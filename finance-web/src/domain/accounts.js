import { getOpenAdvances } from "./transactions.js";

export function calculateAccountBalances(state) {
  const balances = {};
  state.accounts.forEach((account) => {
    balances[account.id] = account.initialBalance || 0;
  });

  state.txs.forEach((tx) => {
    if (tx.type === "income" && balances[tx.acc] !== undefined) balances[tx.acc] += tx.amount;
    if (tx.type === "expense" && balances[tx.acc] !== undefined) balances[tx.acc] -= tx.amount;
    if (tx.type === "advance" && balances[tx.acc] !== undefined) balances[tx.acc] -= tx.amount;
    if (tx.type === "advance_repayment" && balances[tx.acc] !== undefined) balances[tx.acc] += tx.amount;
    if (tx.type === "transfer") {
      if (balances[tx.fromAcc] !== undefined) balances[tx.fromAcc] -= tx.amount;
      if (balances[tx.toAcc] !== undefined) balances[tx.toAcc] += tx.amount;
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

  const totalAssets =
    assets.reduce((sum, item) => sum + item.amount, 0) +
    state.accounts.reduce((sum, account) => sum + (balances[account.id] > 0 ? balances[account.id] : 0), 0) +
    receivableTotal;

  const totalLiabilities =
    liabilities.reduce((sum, item) => sum + item.amount, 0) +
    state.accounts.reduce((sum, account) => sum + (balances[account.id] < 0 ? -balances[account.id] : 0), 0);

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
