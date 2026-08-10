import { resolvePresetRange } from "../domain/date-range.js";
import { toMoneyInt } from "../utils/format.js";

export function createActions(context) {
  const { dom, store, renderAll, renderWishlist, ui } = context;

  return {
    switchTab(tabId) {
      ui.setActiveTab(tabId);
      if (tabId === "wl") ui.populateCategoryBudgetOptions();
      if (tabId === "lg") {
        ui.renderTransactionCategorySelect();
        ui.populateFundOptions();
      }
      renderAll();
    },

    setDatePreset(preset) {
      const range = resolvePresetRange(preset);
      dom.filterStart.value = range.start;
      dom.filterEnd.value = range.end;
      renderAll();
    },

    customDate() {
      dom.filterPreset.value = "custom";
      renderAll();
    },

    addFundCategory() {
      const name = window.prompt("請輸入新的大額準備分類名稱");
      if (!name?.trim()) return;

      const cleanName = name.trim();
      const state = store.getState();
      if (state.userCats.expense.includes(cleanName) || context.constants.expenseCategories.includes(cleanName)) {
        ui.toast.show("這個分類已經存在", "error");
        return;
      }

      store.update((draft) => {
        draft.userCats.expense.push(cleanName);
      });
      context.saveState();
      ui.populateCategoryBudgetOptions();
      dom.fundCategory.value = cleanName;
      ui.toast.show(`已新增分類：${cleanName}`);
    },

    setCatBudget() {
      const amount = toMoneyInt(dom.catBudgetAmount.value);
      if (amount <= 0) {
        ui.toast.show("預算上限必須大於 0", "error");
        return;
      }

      store.update((draft) => {
        draft.settings.catBudgets[dom.catBudgetCategory.value] = amount;
      });
      context.saveState();
      renderWishlist();
      ui.toast.show("已設定分類預算");
    },

    delCatBudget(category) {
      store.update((draft) => {
        delete draft.settings.catBudgets[category];
      });
      context.saveState();
      renderWishlist();
    },

    presetRet(returnRate, inflationRate) {
      dom.retirePrincipalReturn.value = returnRate;
      dom.retirePrincipalReturnValue.textContent = `${returnRate.toFixed(1)}%`;
      dom.retireContributionReturn.value = returnRate;
      dom.retireContributionReturnValue.textContent = `${returnRate.toFixed(1)}%`;
      dom.retireInflation.value = inflationRate;
      dom.retireInflationValue.textContent = `${inflationRate.toFixed(1)}%`;
      renderAll();
    },
  };
}
