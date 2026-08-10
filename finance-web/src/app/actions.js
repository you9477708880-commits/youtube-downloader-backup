import { resolvePresetRange } from "../domain/date-range.js";
import { calculateBudgetData } from "../domain/budget.js";
import {
  buildAdvanceRepayment,
  buildTransaction,
  getAdvanceOutstanding,
  getAdvanceRepaidAmount,
  getOpenAdvances,
} from "../domain/transactions.js";
import { getFundAvailableBeforeExpense, withoutFundEventsLinkedToTransaction } from "../domain/sinking-funds.js";
import { DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { localDateStr, toMoneyInt } from "../utils/format.js";

function createClientId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createFundEventId() {
  return createClientId("fe");
}

function buildMonthRange(date) {
  const month = String(date || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  const endDay = new Date(year, monthIndex, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDay).padStart(2, "0")}`,
  };
}

export function createActions(context) {
  const { dom, store, renderAll, renderWishlist, ui, constants } = context;
  let editingTxId = null;
  let editingOriginalLinkedFundId = "";

  const sameId = (left, right) => String(left) === String(right);

  const resetTransactionForm = () => {
    editingTxId = null;
    editingOriginalLinkedFundId = "";
    dom.inputAmount.value = "";
    if (dom.inputOwnAmount) dom.inputOwnAmount.value = "";
    if (dom.inputAdvancePerson) dom.inputAdvancePerson.value = "";
    if (dom.inputFund) dom.inputFund.value = "";
    if (dom.inputSubcategory) dom.inputSubcategory.value = "";
    dom.inputDesc.value = "";
    ui.setTransactionEditMode({ active: false });
  };

  const getEditableBaseState = (state) =>
    editingTxId
      ? {
          ...state,
          txs: state.txs.filter((tx) => !sameId(tx.id, editingTxId)),
          sinkingFunds: withoutFundEventsLinkedToTransaction(state.sinkingFunds, editingTxId),
        }
      : state;

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

    setTxType(type) {
      if (editingTxId) return;
      store.update((state) => {
        state.txType = type;
      });
      ui.syncTxType();
      ui.renderTransactionCategorySelect({ resetSubcategory: true });
      ui.populateFundOptions();
    },

    addCustomCat() {
      const state = store.getState();
      const typeLabel = state.txType === "income" ? "收入" : "支出";
      const name = window.prompt(`請輸入新的${typeLabel}分類名稱`);
      if (!name?.trim()) return;

      const cleanName = name.trim();
      const baseList = state.txType === "income" ? constants.incomeCategories : constants.expenseCategories;
      if (state.userCats[state.txType].includes(cleanName) || baseList.includes(cleanName)) {
        ui.toast.show("這個分類已經存在", "error");
        return;
      }

      store.update((draft) => {
        draft.userCats[draft.txType].push(cleanName);
      });
      context.saveState();
      ui.renderTransactionCategorySelect({ resetSubcategory: true });
      ui.populateCategoryBudgetOptions();
      dom.inputCategory.value = cleanName;
      ui.populateTransactionSubcategoryOptions({ reset: true });
      ui.toast.show(`已新增分類：${cleanName}`);
    },

    addFundCategory() {
      const name = window.prompt("請輸入新的大額準備分類名稱");
      if (!name?.trim()) return;

      const cleanName = name.trim();
      const state = store.getState();
      if (state.userCats.expense.includes(cleanName) || constants.expenseCategories.includes(cleanName)) {
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

    async addTx() {
      const amount = toMoneyInt(dom.inputAmount.value);
      if (amount <= 0) {
        ui.toast.show("金額必須大於 0", "error");
        return;
      }

      const state = store.getState();
      const editingTx = editingTxId ? state.txs.find((item) => sameId(item.id, editingTxId)) : null;
      const baseState = getEditableBaseState(state);
      const linkedFundId = state.txType === "expense" ? dom.inputFund?.value || "" : "";
      const linkedFund = linkedFundId ? baseState.sinkingFunds.find((fund) => fund.id === linkedFundId) : null;
      if (linkedFundId && !linkedFund) {
        ui.toast.show("找不到對應的大額準備項目", "error");
        return;
      }

      const tx = buildTransaction({
        txType: state.txType,
        amount,
        desc: dom.inputDesc.value,
        date: dom.inputDate.value,
        category: dom.inputCategory.value,
        subcategory: dom.inputSubcategory?.value.trim() || DEFAULT_SUBCATEGORY,
        accountId: dom.inputAccount.value,
        fromAcc: dom.inputFromAccount.value,
        toAcc: dom.inputToAccount.value,
        ownAmount: toMoneyInt(dom.inputOwnAmount?.value),
        person: dom.inputAdvancePerson?.value || "",
        budgetMode: "normal",
        linkedFundId,
      });
      if (editingTx) tx.id = editingTx.id;

      if (tx.type === "transfer" && tx.fromAcc === tx.toAcc) {
        ui.toast.show("轉出與轉入帳戶不能相同", "error");
        return;
      }

      if (tx.type === "advance") {
        if (tx.ownAmount > tx.amount) {
          ui.toast.show("自己負擔金額不能大於總金額", "error");
          return;
        }
        if (tx.receivableAmount <= 0) {
          ui.toast.show("代墊至少要有一部分是別人應還的金額", "error");
          return;
        }
        const alreadyRepaid = editingTx ? getAdvanceRepaidAmount(state.txs, editingTx.id) : 0;
        if (tx.receivableAmount < alreadyRepaid) {
          ui.toast.show(`修改後應收款只有 ${tx.receivableAmount}，不能低於已收回的 ${alreadyRepaid}。`, "error");
          return;
        }
      }

      let topupAmount = 0;
      let fundSpendAmount = tx.type === "expense" && linkedFund ? tx.amount : 0;
      let effectiveLinkedFundId = linkedFundId;
      if (tx.type === "expense" && linkedFund) {
        const availableFromFund = getFundAvailableBeforeExpense(linkedFund, tx.date, tx.id);
        if (availableFromFund < tx.amount) {
          const shortfall = tx.amount - availableFromFund;
          const monthRange = buildMonthRange(tx.date);
          const budget = monthRange ? calculateBudgetData(baseState, monthRange) : null;
          const availableFreedom = budget?.freeToUse || 0;
          const choice = await ui.askFundShortfallChoice({
            fundName: linkedFund.name,
            availableFromFund,
            amount: tx.amount,
            shortfall,
            availableFreedom,
          });

          if (!choice) return;

          if (choice === "topup") {
            if (availableFreedom < shortfall) {
              ui.toast.show(`本月可自由運用只有 ${availableFreedom}，不足以補差額 ${shortfall}。`, "error");
              return;
            }
            topupAmount = shortfall;
            fundSpendAmount = tx.amount;
          } else if (choice === "partial") {
            fundSpendAmount = Math.min(availableFromFund, tx.amount);
            if (fundSpendAmount <= 0) {
              delete tx.linkedFundId;
              effectiveLinkedFundId = "";
            }
          } else if (choice === "unlink") {
            delete tx.linkedFundId;
            effectiveLinkedFundId = "";
            fundSpendAmount = 0;
          }
        }
      }

      store.update((draft) => {
        if (editingTx) {
          draft.txs = draft.txs.map((item) => (sameId(item.id, editingTx.id) ? tx : item));
          draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, editingTx.id);
        } else {
          draft.txs.unshift(tx);
        }

        if (tx.type === "expense" && effectiveLinkedFundId && fundSpendAmount > 0) {
          const fund = draft.sinkingFunds.find((item) => item.id === effectiveLinkedFundId);
          if (fund) {
            if (!Array.isArray(fund.events)) fund.events = [];
            if (topupAmount > 0) {
              fund.events.push({
                id: createFundEventId(),
                type: "topup",
                amount: topupAmount,
                date: tx.date,
                note: "用本月可自由運用補足差額",
                linkedTxId: tx.id,
              });
            }
            fund.events.push({
              id: createFundEventId(),
              type: "spend",
              amount: fundSpendAmount,
              date: tx.date,
              note: tx.desc || tx.cat,
              linkedTxId: tx.id,
            });
          }
        }
      });

      resetTransactionForm();

      context.saveState();
      renderAll();
      if (editingTx && !effectiveLinkedFundId && editingOriginalLinkedFundId) {
        ui.toast.show("已更新交易，原本的大額準備指定已移除");
      } else if (editingTx && effectiveLinkedFundId && topupAmount > 0) {
        ui.toast.show(`已更新交易，並用本月可自由運用補足 ${topupAmount}`);
      } else if (editingTx && effectiveLinkedFundId && fundSpendAmount > 0 && fundSpendAmount < tx.amount) {
        ui.toast.show(`已更新交易，準備金支付 ${fundSpendAmount}，剩餘 ${tx.amount - fundSpendAmount} 算本月支出`);
      } else if (editingTx && effectiveLinkedFundId) {
        ui.toast.show("已更新交易並記錄到大額準備");
      } else if (editingTx) {
        ui.toast.show("已更新交易");
      } else if (effectiveLinkedFundId && topupAmount > 0) {
        ui.toast.show(`已新增交易，並用本月可自由運用補足 ${topupAmount}`);
      } else if (effectiveLinkedFundId && fundSpendAmount > 0 && fundSpendAmount < tx.amount) {
        ui.toast.show(`已新增交易，準備金支付 ${fundSpendAmount}，剩餘 ${tx.amount - fundSpendAmount} 算本月支出`);
      } else if (effectiveLinkedFundId) {
        ui.toast.show("已新增交易並記錄到大額準備");
      } else {
        ui.toast.show("已新增交易");
      }
      this.switchTab("ov");
    },

    beginEditTx(id) {
      const state = store.getState();
      const tx = state.txs.find((item) => sameId(item.id, id));
      if (!tx) {
        ui.toast.show("找不到這筆交易", "error");
        return;
      }
      if (!["income", "expense", "transfer", "advance"].includes(tx.type)) {
        ui.toast.show("這種交易目前不能用這個表單編輯", "error");
        return;
      }

      editingTxId = tx.id;
      editingOriginalLinkedFundId = tx.linkedFundId || "";
      const linkedFundName = editingOriginalLinkedFundId
        ? state.sinkingFunds.find((fund) => fund.id === editingOriginalLinkedFundId)?.name || ""
        : "";
      const advanceRepaidAmount = tx.type === "advance" ? getAdvanceRepaidAmount(state.txs, tx.id) : 0;

      this.switchTab("lg");
      store.update((draft) => {
        draft.txType = tx.type;
      });
      ui.syncTxType();
      ui.renderTransactionCategorySelect({ resetSubcategory: true });
      ui.populateFundOptions();
      ui.setTransactionEditMode({ active: true, linkedFundName, advanceRepaidAmount });

      dom.inputAmount.value = tx.amount ?? "";
      dom.inputDesc.value = tx.desc || "";
      dom.inputDate.value = tx.date || "";
      const category = tx.category || tx.cat || "";
      if (category && ![...dom.inputCategory.options].some((option) => option.value === category)) {
        dom.inputCategory.append(new Option(category, category));
      }
      dom.inputCategory.value = category;
      ui.populateTransactionSubcategoryOptions();
      if (dom.inputSubcategory) dom.inputSubcategory.value = tx.subcategory || DEFAULT_SUBCATEGORY;

      if (tx.type === "transfer") {
        dom.inputFromAccount.value = tx.fromAcc || "";
        dom.inputToAccount.value = tx.toAcc || "";
      } else {
        dom.inputAccount.value = tx.acc || "";
      }
      if (tx.type === "advance") {
        dom.inputOwnAmount.value = tx.ownAmount ?? "";
        dom.inputAdvancePerson.value = tx.person || "";
      }

      if (dom.inputFund) {
        dom.inputFund.value = "";
      }

      dom.root.getElementById("form-tx")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    cancelEditTx() {
      resetTransactionForm();
      ui.syncTxType();
      ui.renderTransactionCategorySelect();
      ui.populateFundOptions();
      ui.toast.show("已取消編輯");
    },

    delTx(id) {
      if (!window.confirm("確定要刪除這筆交易嗎？")) return;
      store.update((draft) => {
        const target = draft.txs.find((tx) => sameId(tx.id, id));
        draft.txs = draft.txs.filter((tx) => !sameId(tx.id, id) && !(target?.type === "advance" && tx.type === "advance_repayment" && sameId(tx.advanceId, id)));
        draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, id);
      });
      context.saveState();
      renderAll();
      ui.toast.show("已刪除交易");
    },

    repayAdvance(id) {
      const state = store.getState();
      const advance = getOpenAdvances(state.txs).find((tx) => sameId(tx.id, id));
      if (!advance) {
        ui.toast.show("找不到這筆尚未收回的代墊", "error");
        return;
      }

      const rawAmount = window.prompt(`這次收回多少？尚未收回 ${advance.outstandingAmount}`, String(advance.outstandingAmount));
      if (rawAmount === null) return;
      const amount = toMoneyInt(rawAmount);
      if (amount <= 0 || amount > getAdvanceOutstanding(state.txs, advance)) {
        ui.toast.show("收回金額不正確", "error");
        return;
      }

      const accountMenu = state.accounts.map((account, index) => `${index + 1}. ${account.name}`).join("\n");
      const rawIndex = window.prompt(`收款到哪個帳戶？\n${accountMenu}`, "1");
      if (rawIndex === null) return;
      const account = state.accounts[Math.max(0, Math.min(state.accounts.length - 1, Number(rawIndex) - 1))];
      if (!account) {
        ui.toast.show("沒有選到有效帳戶", "error");
        return;
      }

      const repayment = buildAdvanceRepayment({
        advanceId: advance.id,
        amount,
        date: localDateStr(new Date()),
        accountId: account.id,
        person: advance.person,
      });

      store.update((draft) => {
        draft.txs.unshift(repayment);
      });
      context.saveState();
      renderAll();
      ui.toast.show("已登記收款");
    },

    editAdvanceRepayment(id) {
      const state = store.getState();
      const repayment = state.txs.find((tx) => sameId(tx.id, id) && tx.type === "advance_repayment");
      if (!repayment) {
        ui.toast.show("找不到這筆代墊收款", "error");
        return;
      }

      const advance = state.txs.find((tx) => sameId(tx.id, repayment.advanceId) && tx.type === "advance");
      if (!advance) {
        ui.toast.show("找不到這筆收款對應的代墊", "error");
        return;
      }

      const maxAmount = Math.max(0, (advance.receivableAmount || 0) - getAdvanceRepaidAmount(state.txs, advance.id, repayment.id));
      const rawAmount = window.prompt(`修改這次收回多少？最多 ${maxAmount}`, String(repayment.amount));
      if (rawAmount === null) return;
      const amount = toMoneyInt(rawAmount);
      if (amount <= 0 || amount > maxAmount) {
        ui.toast.show("收回金額不正確", "error");
        return;
      }

      const rawDate = window.prompt("這次收款日期？", repayment.date || localDateStr(new Date()));
      if (rawDate === null) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        ui.toast.show("日期格式不正確", "error");
        return;
      }

      const accountMenu = state.accounts.map((account, index) => `${index + 1}. ${account.name}`).join("\n");
      const currentIndex = Math.max(0, state.accounts.findIndex((account) => account.id === repayment.acc));
      const rawIndex = window.prompt(`收款到哪個帳戶？\n${accountMenu}`, String(currentIndex + 1));
      if (rawIndex === null) return;
      const account = state.accounts[Math.max(0, Math.min(state.accounts.length - 1, Number(rawIndex) - 1))];
      if (!account) {
        ui.toast.show("沒有選到有效帳戶", "error");
        return;
      }

      store.update((draft) => {
        const target = draft.txs.find((tx) => sameId(tx.id, id));
        if (!target) return;
        target.amount = amount;
        target.date = rawDate;
        target.acc = account.id;
      });
      context.saveState();
      renderAll();
      ui.toast.show("已更新代墊收款");
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
