export function calculateBudgetData(state, filteredTxs) {
  const cap = state.settings.budgetCap || 0;
  const expense = filteredTxs.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const available = Math.max(0, cap - expense);
  const percentage = cap > 0 ? Math.min(100, (expense / cap) * 100) : 0;
  const remaining = cap - expense;

  const categoryBudgets = Object.entries(state.settings.catBudgets).map(([category, budget]) => {
    const categoryExpense = filteredTxs
      .filter((tx) => tx.type === "expense" && tx.cat === category)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const categoryPercentage = budget > 0 ? Math.min(100, (categoryExpense / budget) * 100) : 0;
    return {
      category,
      budget,
      expense: categoryExpense,
      percentage: categoryPercentage,
    };
  });

  return {
    cap,
    expense,
    available,
    percentage,
    remaining,
    categoryBudgets,
  };
}
