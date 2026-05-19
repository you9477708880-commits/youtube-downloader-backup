import { toMoneyInt } from "./format.js";

function normalizeList(list, normalizeItem) {
  return Array.isArray(list) ? list.map((item) => normalizeItem({ ...item })) : [];
}

function normalizeCatBudgets(catBudgets) {
  return Object.fromEntries(
    Object.entries(catBudgets || {}).map(([category, amount]) => [category, toMoneyInt(amount)]),
  );
}

export function normalizeFinanceStateMoney(state) {
  const next = {
    ...state,
    txs: normalizeList(state.txs, (tx) => {
      tx.amount = toMoneyInt(tx.amount);
      if ("ownAmount" in tx) tx.ownAmount = toMoneyInt(tx.ownAmount);
      if ("receivableAmount" in tx) tx.receivableAmount = Math.max(0, toMoneyInt(tx.receivableAmount));
      return tx;
    }),
    bsI: normalizeList(state.bsI, (item) => {
      item.amount = toMoneyInt(item.amount);
      return item;
    }),
    wishes: normalizeList(state.wishes, (wish) => {
      wish.price = toMoneyInt(wish.price);
      return wish;
    }),
    accounts: normalizeList(state.accounts, (account) => {
      account.initialBalance = toMoneyInt(account.initialBalance);
      return account;
    }),
    sinkingFunds: normalizeList(state.sinkingFunds, (fund) => {
      fund.targetAmount = toMoneyInt(fund.targetAmount);
      fund.monthlyContribution = toMoneyInt(fund.monthlyContribution);
      fund.events = normalizeList(fund.events, (event) => {
        event.amount = toMoneyInt(event.amount);
        return event;
      });
      return fund;
    }),
    settings: {
      ...(state.settings || {}),
      budgetCap: toMoneyInt(state.settings?.budgetCap),
      retManualAsset: toMoneyInt(state.settings?.retManualAsset),
      catBudgets: normalizeCatBudgets(state.settings?.catBudgets),
    },
  };

  next.txs = next.txs.map((tx) => {
    if (tx.type === "advance") {
      tx.ownAmount = Math.min(Math.max(0, toMoneyInt(tx.ownAmount)), tx.amount);
      tx.receivableAmount = Math.max(0, tx.amount - tx.ownAmount);
    }
    return tx;
  });

  return next;
}
