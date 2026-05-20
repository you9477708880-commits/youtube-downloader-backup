import { DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { toMoneyInt } from "../utils/format.js";

export function createTransactionId(prefix = "tx") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toSafeCount(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function compareTransactionsByDateDesc(a, b) {
  const dateA = String(a?.date || "");
  const dateB = String(b?.date || "");
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

export function getTransactionCategory(tx) {
  return String(tx?.category || tx?.cat || DEFAULT_SUBCATEGORY);
}

export function getTransactionSubcategory(tx) {
  return String(tx?.subcategory || DEFAULT_SUBCATEGORY);
}

export function formatTransactionCategory(tx) {
  const category = getTransactionCategory(tx);
  const subcategory = getTransactionSubcategory(tx);
  return subcategory && subcategory !== DEFAULT_SUBCATEGORY ? `${category} / ${subcategory}` : category;
}

export function buildTransaction({
  txType,
  amount,
  desc,
  date,
  category,
  subcategory,
  accountId,
  fromAcc,
  toAcc,
  ownAmount,
  person,
  budgetMode,
  spreadMonths,
  spreadStartMonth,
  spreadLabel,
  linkedFundId,
}) {
  const tx = {
    id: createTransactionId(),
    type: txType,
    amount: toMoneyInt(amount),
    desc: (desc || "").trim(),
    date,
    category: category || DEFAULT_SUBCATEGORY,
    subcategory: subcategory || DEFAULT_SUBCATEGORY,
  };

  if (txType === "transfer") {
    tx.fromAcc = fromAcc;
    tx.toAcc = toAcc;
    tx.cat = "轉帳";
    tx.category = "轉帳";
  } else if (txType === "advance") {
    const own = Math.max(0, toMoneyInt(ownAmount));
    tx.acc = accountId;
    tx.category = category || DEFAULT_SUBCATEGORY;
    tx.cat = tx.category;
    tx.ownAmount = Math.min(own, tx.amount);
    tx.receivableAmount = Math.max(0, tx.amount - tx.ownAmount);
    tx.person = person.trim() || "未指定";
  } else {
    tx.acc = accountId;
    tx.category = category || DEFAULT_SUBCATEGORY;
    tx.cat = tx.category;
    if (txType === "expense" && linkedFundId) {
      tx.linkedFundId = linkedFundId;
    }
    if (txType === "expense" && budgetMode === "spread") {
      tx.budgetMode = "spread";
      tx.spreadMonths = Math.max(2, toSafeCount(spreadMonths, 0));
      tx.spreadStartMonth = spreadStartMonth || date.slice(0, 7);
      tx.spreadLabel = (spreadLabel || "").trim();
    }
  }

  return tx;
}

export function buildAdvanceRepayment({ advanceId, amount, date, accountId, person }) {
  return {
    id: createTransactionId("repay"),
    type: "advance_repayment",
    advanceId,
    amount: toMoneyInt(amount),
    date,
    acc: accountId,
    cat: "代墊收款",
    category: "代墊收款",
    subcategory: DEFAULT_SUBCATEGORY,
    desc: `${person || "對方"} 還款`,
    person: person || "未指定",
  };
}

export function getPersonalExpenseAmount(tx) {
  if (tx.type === "expense") return tx.amount;
  if (tx.type === "advance") return tx.ownAmount ?? tx.amount;
  return 0;
}

export function isBudgetSpreadTx(tx) {
  return tx?.type === "expense" && tx?.budgetMode === "spread" && Number(tx?.spreadMonths) >= 2 && /^\d{4}-\d{2}$/.test(tx?.spreadStartMonth || "");
}

export function getAdvanceRepayments(txs, advanceId) {
  return txs.filter((tx) => tx.type === "advance_repayment" && String(tx.advanceId) === String(advanceId));
}

export function getAdvanceRepaidAmount(txs, advanceId, excludedRepaymentId = null) {
  return getAdvanceRepayments(txs, advanceId)
    .filter((tx) => String(tx.id) !== String(excludedRepaymentId ?? ""))
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function getAdvanceOutstanding(txs, advanceTx) {
  const repaid = getAdvanceRepaidAmount(txs, advanceTx.id);
  return Math.max(0, (advanceTx.receivableAmount || 0) - repaid);
}

export function getOpenAdvances(txs) {
  return txs
    .filter((tx) => tx.type === "advance" && getAdvanceOutstanding(txs, tx) > 0)
    .map((tx) => ({
      ...tx,
      repaidAmount: getAdvanceRepaidAmount(txs, tx.id),
      outstandingAmount: getAdvanceOutstanding(txs, tx),
    }));
}

export function groupTransactionsByDate(txs) {
  const sorted = [...txs].sort(compareTransactionsByDateDesc);
  const groups = new Map();

  sorted.forEach((tx) => {
    if (!groups.has(tx.date)) groups.set(tx.date, { inc: 0, exp: 0, txs: [] });
    const group = groups.get(tx.date);
    group.txs.push(tx);
    if (tx.type === "income") group.inc += tx.amount;
    else group.exp += getPersonalExpenseAmount(tx);
  });

  return groups;
}

export function summarizeOverview(txs) {
  const income = txs.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = txs.reduce((sum, tx) => sum + getPersonalExpenseAmount(tx), 0);
  return {
    income,
    expense,
    net: income - expense,
  };
}

export function summarizeExpenseCategories(txs) {
  const expenseMap = {};
  txs.forEach((tx) => {
    const expense = getPersonalExpenseAmount(tx);
    if (expense <= 0) return;
    const category = getTransactionCategory(tx);
    expenseMap[category] = (expenseMap[category] || 0) + expense;
  });
  return Object.entries(expenseMap).sort((a, b) => b[1] - a[1]);
}

export function summarizeCashFlow(txs) {
  const investingIncomeCategories = ["投資收益", "股息收入"];
  const operatingIncome = txs
    .filter((tx) => tx.type === "income" && !investingIncomeCategories.includes(getTransactionCategory(tx)))
    .reduce((sum, tx) => sum + tx.amount, 0);
  const operatingExpense = txs.reduce((sum, tx) => sum + getPersonalExpenseAmount(tx), 0);
  const investingIncome = txs
    .filter((tx) => tx.type === "income" && investingIncomeCategories.includes(getTransactionCategory(tx)))
    .reduce((sum, tx) => sum + tx.amount, 0);

  return {
    operatingIncome,
    operatingExpense,
    investingIncome,
    netOperating: operatingIncome - operatingExpense,
    netTotal: operatingIncome - operatingExpense + investingIncome,
  };
}
