import { CURRENT_SCHEMA_VERSION, DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { toMoneyInt } from "./format.js";

function normalizeList(list, normalizeItem) {
  return Array.isArray(list) ? list.map((item) => normalizeItem({ ...item })) : [];
}

function normalizeCatBudgets(catBudgets) {
  return Object.fromEntries(
    Object.entries(catBudgets || {}).map(([category, amount]) => [category, toMoneyInt(amount)]),
  );
}

function normalizeCategoryText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeTransactionCategory(tx) {
  const category = normalizeCategoryText(tx.category, normalizeCategoryText(tx.cat, DEFAULT_SUBCATEGORY));
  const subcategory = normalizeCategoryText(tx.subcategory, DEFAULT_SUBCATEGORY);

  tx.category = category;
  tx.subcategory = subcategory;
  tx.cat = category;
  return tx;
}

function normalizeLifeRoutine(routine) {
  routine.name = String(routine.name ?? "").trim().slice(0, 200);
  routine.query = String(routine.query ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 200);
  routine.expectedIntervalDays = Math.min(3650, Math.max(1, Math.trunc(Number(routine.expectedIntervalDays) || 1)));
  routine.dueSoonDays = Math.min(365, Math.max(0, Math.trunc(Number(routine.dueSoonDays) || 0)));
  routine.enabled = routine.enabled !== false;
  routine.createdAt = String(routine.createdAt ?? "").slice(0, 40);
  routine.updatedAt = String(routine.updatedAt ?? "").slice(0, 40);
  return routine;
}

export function normalizeFinanceStateMoney(state) {
  const next = {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    txs: normalizeList(state.txs, (tx) => {
      normalizeTransactionCategory(tx);
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
      if ("creditLimit" in account) account.creditLimit = Math.max(0, toMoneyInt(account.creditLimit));
      if ("statementDay" in account) account.statementDay = Math.min(28, Math.max(0, toMoneyInt(account.statementDay)));
      if ("paymentDueDay" in account) account.paymentDueDay = Math.min(28, Math.max(0, toMoneyInt(account.paymentDueDay)));
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
    lifeRoutines: normalizeList(state.lifeRoutines, normalizeLifeRoutine),
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
