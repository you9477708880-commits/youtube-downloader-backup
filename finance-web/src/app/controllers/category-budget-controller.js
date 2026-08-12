import { getUnusedCategoryBudgetNames } from "../../domain/category-budgets.js";
import { toMoneyInt } from "../../utils/format.js";

export function createCategoryBudgetController({
  elements,
  store,
  toast,
  commitState,
  renderBudget,
  populateOptions,
  constants = {},
  promptInput = (message) => globalThis.window.prompt(message),
  confirmCleanup = (message) => globalThis.window.confirm(message),
}) {
  const { category, amount, budgetCap, fundCategory } = elements;

  const addFundCategory = () => {
    const name = promptInput("請輸入新的大額準備分類名稱");
    if (!name?.trim()) return;

    const cleanName = name.trim();
    const state = store.getState();
    if (state.userCats.expense.includes(cleanName) || (constants.expenseCategories || []).includes(cleanName)) {
      toast.show("這個分類已經存在", "error");
      return;
    }

    commitState((draft) => {
      draft.userCats.expense.push(cleanName);
    }, {
      updateUi: () => {
        populateOptions();
        fundCategory.value = cleanName;
      },
    });
    toast.show(`已新增分類：${cleanName}`);
  };

  const setCatBudget = () => {
    const normalizedAmount = toMoneyInt(amount.value);
    if (normalizedAmount <= 0) {
      toast.show("預算上限必須大於 0", "error");
      return;
    }

    commitState((draft) => {
      draft.settings.catBudgets[category.value] = normalizedAmount;
    }, { updateUi: renderBudget });
    toast.show("已設定分類預算");
  };

  const delCatBudget = (categoryName) => {
    commitState((draft) => {
      delete draft.settings.catBudgets[categoryName];
    }, { updateUi: renderBudget });
  };

  const cleanupCatBudgets = () => {
    const unusedCategories = getUnusedCategoryBudgetNames(store.getState(), constants);
    if (!unusedCategories.length) {
      toast.show("目前沒有需要清理的分類預算");
      return;
    }

    const message = `將移除 ${unusedCategories.length} 個未使用分類預算：\n${unusedCategories.join("、")}\n\n確定要清理嗎？`;
    if (!confirmCleanup(message)) return;

    commitState((draft) => {
      unusedCategories.forEach((categoryName) => {
        delete draft.settings.catBudgets[categoryName];
      });
    }, { updateUi: renderBudget });
    toast.show(`已清理 ${unusedCategories.length} 個未使用分類預算`);
  };

  const updateBudgetCap = () => {
    commitState((draft) => {
      draft.settings.budgetCap = toMoneyInt(budgetCap.value);
    }, { updateUi: renderBudget });
  };

  const reset = () => {};

  return {
    addFundCategory,
    setCatBudget,
    delCatBudget,
    cleanupCatBudgets,
    updateBudgetCap,
    reset,
  };
}
