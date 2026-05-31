import { getPersonalExpenseAmount, getTransactionCategory } from "./transactions.js";

export function getUsedExpenseBudgetCategories(state, constants) {
  const used = new Set([...(constants.expenseCategories || []), ...(state.userCats?.expense || [])]);

  (state.txs || []).forEach((tx) => {
    if (getPersonalExpenseAmount(tx) > 0) {
      used.add(getTransactionCategory(tx));
    }
  });

  return used;
}

export function getUnusedCategoryBudgetNames(state, constants) {
  const used = getUsedExpenseBudgetCategories(state, constants);
  return Object.keys(state.settings?.catBudgets || {})
    .filter((category) => !used.has(category))
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
}
