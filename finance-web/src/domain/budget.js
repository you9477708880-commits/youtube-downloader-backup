import { getPersonalExpenseAmount, isBudgetSpreadTx } from "./transactions.js";

function isDateInRange(date, range) {
  const { start, end } = range || {};
  if (!start || !end) return true;
  return date >= start && date <= end;
}

function addMonths(monthKey, delta) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const next = new Date(year, month + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthBounds(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = `${monthKey}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  return { start, end };
}

function doesRangeOverlapMonth(range, monthKey) {
  const { start, end } = range || {};
  if (!start || !end) return true;
  const bounds = getMonthBounds(monthKey);
  return !(end < bounds.start || start > bounds.end);
}

export function buildSpreadSchedule(tx) {
  if (!isBudgetSpreadTx(tx)) return [];

  const months = Math.max(2, Math.round(tx.spreadMonths || 0));
  const base = Math.floor(tx.amount / months);
  const remainder = tx.amount - base * months;

  return Array.from({ length: months }, (_, index) => ({
    monthKey: addMonths(tx.spreadStartMonth, index),
    amount: base + (index < remainder ? 1 : 0),
    index,
    totalMonths: months,
  }));
}

export function getBudgetAmountForRange(tx, range, viewMode = "actual") {
  if (tx.type === "advance") return isDateInRange(tx.date, range) ? getPersonalExpenseAmount(tx) : 0;
  if (tx.type !== "expense") return 0;

  if (viewMode !== "spread" || !isBudgetSpreadTx(tx)) {
    return isDateInRange(tx.date, range) ? tx.amount : 0;
  }

  return buildSpreadSchedule(tx)
    .filter((entry) => doesRangeOverlapMonth(range, entry.monthKey))
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function getBudgetSpreadItems(state, range) {
  return state.txs
    .filter((tx) => isBudgetSpreadTx(tx))
    .map((tx) => {
      const schedule = buildSpreadSchedule(tx);
      const activeEntries = schedule.filter((entry) => doesRangeOverlapMonth(range, entry.monthKey));
      return {
        ...tx,
        schedule,
        activeEntries,
        coveredMonths: activeEntries.length,
        periodAmount: activeEntries.reduce((sum, entry) => sum + entry.amount, 0),
        monthlyBaseAmount: schedule[0]?.amount || 0,
      };
    })
    .filter((tx) => tx.periodAmount > 0);
}

function getBudgetCategoryEntries(state, category, range, viewMode) {
  return state.txs
    .filter((tx) => tx.cat === category)
    .map((tx) => {
      const amount = getBudgetAmountForRange(tx, range, viewMode);
      if (amount <= 0) return null;
      return {
        id: tx.id,
        type: tx.type,
        date: tx.date,
        desc: tx.desc || "",
        cat: tx.cat,
        amount,
        originalAmount: getPersonalExpenseAmount(tx),
        isSpread: viewMode === "spread" && isBudgetSpreadTx(tx),
        spreadLabel: tx.spreadLabel || "",
        spreadMonths: tx.spreadMonths || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.id - a.id));
}

export function calculateBudgetData(state, range) {
  const cap = state.settings.budgetCap || 0;
  const viewMode = state.settings.budgetViewMode || "actual";
  const actualExpense = state.txs.reduce((sum, tx) => sum + getBudgetAmountForRange(tx, range, "actual"), 0);
  const spreadExpense = state.txs.reduce((sum, tx) => sum + getBudgetAmountForRange(tx, range, "spread"), 0);
  const expense = viewMode === "spread" ? spreadExpense : actualExpense;
  const available = Math.max(0, cap - actualExpense);
  const planningRoom = Math.max(0, cap - spreadExpense);
  const percentage = cap > 0 ? Math.min(100, (expense / cap) * 100) : 0;
  const remaining = cap - expense;

  const categoryBudgets = Object.entries(state.settings.catBudgets).map(([category, budget]) => {
    const categoryExpense = state.txs
      .filter((tx) => tx.cat === category)
      .reduce((sum, tx) => sum + getBudgetAmountForRange(tx, range, viewMode), 0);
    const categoryPercentage = budget > 0 ? Math.min(100, (categoryExpense / budget) * 100) : 0;
    return {
      category,
      budget,
      expense: categoryExpense,
      percentage: categoryPercentage,
      items: getBudgetCategoryEntries(state, category, range, viewMode),
    };
  });

  return {
    cap,
    actualExpense,
    spreadExpense,
    expense,
    available,
    planningRoom,
    percentage,
    remaining,
    viewMode,
    budgetItems: state.txs
      .map((tx) => {
        const amount = getBudgetAmountForRange(tx, range, viewMode);
        if (amount <= 0) return null;
        return {
          id: tx.id,
          type: tx.type,
          date: tx.date,
          desc: tx.desc || "",
          cat: tx.cat || "",
          amount,
          originalAmount: getPersonalExpenseAmount(tx),
          isSpread: viewMode === "spread" && isBudgetSpreadTx(tx),
          spreadLabel: tx.spreadLabel || "",
          spreadMonths: tx.spreadMonths || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.id - a.id)),
    spreadItems: getBudgetSpreadItems(state, range),
    categoryBudgets,
  };
}
