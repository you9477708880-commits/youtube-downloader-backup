import { compareTransactionsByDateDesc, formatTransactionCategory, getPersonalExpenseAmount, getTransactionCategory } from "./transactions.js";
import { getFundAvailableBeforeExpense, getLinkedFundSpendAmount, summarizeFund } from "./sinking-funds.js";

function isDateInRange(date, range) {
  const { start, end } = range || {};
  if (!start || !end) return true;
  return date >= start && date <= end;
}

function buildLivingExpenseItems(state, range) {
  return state.txs
    .map((tx) => {
      if (!isDateInRange(tx.date, range)) return null;

      let amount = getPersonalExpenseAmount(tx);
      const category = getTransactionCategory(tx);
      const categoryLabel = formatTransactionCategory(tx);
      let subtitle = `${categoryLabel} ｜ 實際支出 ${amount}`;

      if (tx.type === "expense" && tx.linkedFundId) {
        const fund = (state.sinkingFunds || []).find((item) => item.id === tx.linkedFundId);
        const linkedSpend = fund ? getLinkedFundSpendAmount(fund, tx.id) : 0;
        const covered = fund
          ? Math.min(amount, linkedSpend > 0 ? linkedSpend : getFundAvailableBeforeExpense(fund, tx.date, tx.id))
          : 0;
        const uncovered = Math.max(0, amount - covered);
        amount = uncovered;
        subtitle =
          covered > 0
            ? `${categoryLabel} ｜ 已用準備 ${covered}${uncovered > 0 ? ` ｜ 差額 ${uncovered}` : " ｜ 本月不另外扣款"}`
            : `${categoryLabel} ｜ 準備不足，列入本月 ${uncovered}`;
      }

      if (amount <= 0) return null;
      return {
        id: tx.id,
        type: "living-expense",
        date: tx.date,
        title: tx.desc || tx.cat || "未命名支出",
        subtitle,
        amount,
        category,
      };
    })
    .filter(Boolean)
    .sort(compareTransactionsByDateDesc);
}

export function calculateBudgetData(state, range) {
  const cap = state.settings.budgetCap || 0;
  const funds = (state.sinkingFunds || []).map((fund) => summarizeFund(fund, range));
  const livingExpenseItems = buildLivingExpenseItems(state, range);
  const livingExpense = livingExpenseItems.reduce((sum, item) => sum + item.amount, 0);
  const fundContribution = funds.reduce((sum, fund) => sum + fund.plannedContribution, 0);
  const manualTopups = funds.reduce((sum, fund) => sum + fund.topupAmount, 0);
  const freeToUse = Math.max(0, cap - livingExpense - fundContribution - manualTopups);

  const sourceItems = [
    ...livingExpenseItems,
    ...funds
      .filter((fund) => fund.plannedContribution > 0)
      .map((fund) => ({
        id: `plan-${fund.id}`,
        type: "fund-plan",
        date: `${fund.startMonth}-01`,
        title: fund.name,
        subtitle: `每月提撥 ${fund.monthlyContribution} ｜ 本期規劃 ${fund.plannedContribution}`,
        amount: fund.plannedContribution,
        category: fund.category || "",
      })),
    ...funds.flatMap((fund) =>
      fund.topupsInRange.map((event) => ({
        id: event.id,
        type: "fund-topup",
        date: event.date,
        title: fund.name,
        subtitle: `手動補入 ｜ ${event.note || "未填備註"}`,
        amount: event.amount,
        category: fund.category || "",
      })),
    ),
  ].sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : String(b.id).localeCompare(String(a.id))));

  const categoryBudgets = Object.entries(state.settings.catBudgets || {}).map(([category, budget]) => {
    const items = livingExpenseItems.filter((item) => item.category === category);
    const expense = items.reduce((sum, item) => sum + item.amount, 0);
    return {
      category,
      budget,
      expense,
      percentage: budget > 0 ? Math.min(100, (expense / budget) * 100) : 0,
      items,
    };
  });

  return {
    cap,
    livingExpense,
    fundContribution,
    freeToUse,
    remainingAllocatable: freeToUse,
    manualTopups,
    funds,
    sourceItems,
    categoryBudgets,
  };
}
