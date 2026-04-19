import { resolvePresetRange } from "../domain/date-range.js";
import { buildTransaction } from "../domain/transactions.js";

export function createActions(context) {
  const { dom, store, renderAll, renderWishlist, ui, constants } = context;

  return {
    switchTab(tabId) {
      ui.setActiveTab(tabId);
      if (tabId === "wl") ui.populateCategoryBudgetOptions();
      if (tabId === "lg") ui.renderTransactionCategorySelect();
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

    setTxType(type) {
      store.update((state) => {
        state.txType = type;
      });
      ui.syncTxType();
      ui.renderTransactionCategorySelect();
    },

    addCustomCat() {
      const state = store.getState();
      const typeLabel = state.txType === "income" ? "收入" : "支出";
      const name = window.prompt(`請輸入新的${typeLabel}類別名稱：`);
      if (!name?.trim()) return;

      const cleanName = name.trim();
      const baseList = state.txType === "income" ? constants.incomeCategories : constants.expenseCategories;
      if (state.userCats[state.txType].includes(cleanName) || baseList.includes(cleanName)) {
        ui.toast.show("此類別已存在！", "error");
        return;
      }

      store.update((draft) => {
        draft.userCats[draft.txType].push(cleanName);
      });
      context.saveState();
      ui.renderTransactionCategorySelect();
      dom.inputCategory.value = cleanName;
      ui.toast.show(`已新增類別：${cleanName}`);
    },

    addTx() {
      const amount = Math.round(parseFloat(dom.inputAmount.value) || 0);
      if (amount <= 0) {
        ui.toast.show("請輸入大於 0 的金額", "error");
        return;
      }

      const state = store.getState();
      const tx = buildTransaction({
        txType: state.txType,
        amount,
        desc: dom.inputDesc.value,
        date: dom.inputDate.value,
        category: dom.inputCategory.value,
        accountId: dom.inputAccount.value,
        fromAcc: dom.inputFromAccount.value,
        toAcc: dom.inputToAccount.value,
      });

      if (tx.type === "transfer" && tx.fromAcc === tx.toAcc) {
        ui.toast.show("轉出與轉入不能相同", "error");
        return;
      }

      store.update((draft) => {
        draft.txs.unshift(tx);
      });
      dom.inputAmount.value = "";
      dom.inputDesc.value = "";
      context.saveState();
      renderAll();
      ui.toast.show("記錄儲存成功");
      this.switchTab("ov");
    },

    delTx(id) {
      if (!window.confirm("確定要刪除這筆交易嗎？")) return;
      store.update((draft) => {
        draft.txs = draft.txs.filter((tx) => tx.id !== id);
      });
      context.saveState();
      renderAll();
      ui.toast.show("已刪除");
    },

    addBs() {
      const amount = Math.round(parseFloat(dom.balanceAmount.value) || 0);
      if (amount < 0) {
        ui.toast.show("金額不能為負數", "error");
        return;
      }

      store.update((draft) => {
        if (dom.balanceType.value === "account") {
          draft.accounts.push({
            id: `a${Date.now()}`,
            name: dom.balanceName.value.trim(),
            type: "asset",
            isEm: dom.balanceEmergency.checked,
            initialBalance: amount,
          });
        } else {
          draft.bsI.push({
            id: Date.now(),
            name: dom.balanceName.value.trim(),
            amount,
            cat: dom.balanceCategory.value,
            isEm: dom.balanceEmergency.checked,
          });
        }
      });

      dom.balanceName.value = "";
      dom.balanceAmount.value = "";
      dom.balanceEmergency.checked = false;
      context.saveState();
      renderAll();
      ui.toast.show("資產/帳戶已新增");
    },

    delBs(id, isAccount) {
      if (!window.confirm("確定要刪除此項目嗎？")) return;
      store.update((draft) => {
        if (isAccount) draft.accounts = draft.accounts.filter((account) => account.id !== id);
        else draft.bsI = draft.bsI.filter((item) => String(item.id) !== String(id));
      });
      context.saveState();
      renderAll();
    },

    toggleEm(id, isAccount) {
      store.update((draft) => {
        const list = isAccount ? draft.accounts : draft.bsI;
        const item = list.find((entry) => String(entry.id) === String(id));
        if (item) item.isEm = !item.isEm;
      });
      context.saveState();
      renderAll();
    },

    setCatBudget() {
      const amount = Math.round(parseFloat(dom.catBudgetAmount.value) || 0);
      if (amount <= 0) {
        ui.toast.show("金額必須大於 0", "error");
        return;
      }

      store.update((draft) => {
        draft.settings.catBudgets[dom.catBudgetCategory.value] = amount;
      });
      context.saveState();
      renderWishlist();
      ui.toast.show("分類預算已設定");
    },

    delCatBudget(category) {
      store.update((draft) => {
        delete draft.settings.catBudgets[category];
      });
      context.saveState();
      renderWishlist();
    },

    addWish() {
      const price = Math.round(parseFloat(dom.wishPrice.value) || 0);
      if (price <= 0) {
        ui.toast.show("金額必須大於 0", "error");
        return;
      }

      store.update((draft) => {
        draft.wishes.push({
          id: Date.now(),
          name: dom.wishName.value.trim(),
          price,
          cat: dom.wishCategory.value,
        });
      });
      dom.wishName.value = "";
      dom.wishPrice.value = "";
      context.saveState();
      renderWishlist();
      ui.toast.show("已加入待購清單");
    },

    delWish(id) {
      store.update((draft) => {
        draft.wishes = draft.wishes.filter((wish) => wish.id !== id);
      });
      context.saveState();
      renderWishlist();
    },

    mvWish(id, dir) {
      store.update((draft) => {
        const index = draft.wishes.findIndex((wish) => wish.id === id);
        if (index < 0) return;
        const nextIndex = index + dir;
        if (nextIndex < 0 || nextIndex >= draft.wishes.length) return;
        const [wish] = draft.wishes.splice(index, 1);
        draft.wishes.splice(nextIndex, 0, wish);
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
