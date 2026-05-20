import { resolvePresetRange } from "../domain/date-range.js";
import { calculateBudgetData } from "../domain/budget.js";
import {
  buildAdvanceRepayment,
  buildTransaction,
  getAdvanceOutstanding,
  getAdvanceRepaidAmount,
  getOpenAdvances,
} from "../domain/transactions.js";
import { getFundAvailableBeforeExpense, getFundTargetPlanStatus, withoutFundEventsLinkedToTransaction } from "../domain/sinking-funds.js";
import { localDateStr, toMoneyInt } from "../utils/format.js";

function createClientId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createFundEventId() {
  return createClientId("fe");
}

function escapeCssValue(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
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
  let editingFundId = "";
  let editingBsId = "";
  let editingBsIsAccount = false;
  let editingWishId = null;

  const resetTransactionForm = () => {
    editingTxId = null;
    editingOriginalLinkedFundId = "";
    dom.inputAmount.value = "";
    if (dom.inputOwnAmount) dom.inputOwnAmount.value = "";
    if (dom.inputAdvancePerson) dom.inputAdvancePerson.value = "";
    if (dom.inputFund) dom.inputFund.value = "";
    dom.inputDesc.value = "";
    ui.setTransactionEditMode({ active: false });
  };

  const getEditableBaseState = (state) =>
    editingTxId
      ? {
          ...state,
          txs: state.txs.filter((tx) => tx.id !== editingTxId),
          sinkingFunds: withoutFundEventsLinkedToTransaction(state.sinkingFunds, editingTxId),
        }
      : state;

  const resetFundForm = () => {
    editingFundId = "";
    dom.fundName.value = "";
    dom.fundTarget.value = "";
    dom.fundMonthly.value = "";
    dom.fundTargetMonth.value = "";
    dom.fundNote.value = "";
    dom.fundCarry.checked = true;
    ui.setFundEditMode({ active: false });
  };

  const readFundFormValues = () => ({
    name: dom.fundName.value.trim(),
    category: dom.fundCategory.value,
    targetAmount: toMoneyInt(dom.fundTarget.value),
    monthlyContribution: toMoneyInt(dom.fundMonthly.value),
    startMonth: dom.fundStart.value,
    targetMonth: dom.fundTargetMonth.value,
    carryoverEnabled: !!dom.fundCarry.checked,
    note: dom.fundNote.value.trim(),
  });

  const resetBalanceSheetForm = () => {
    editingBsId = "";
    editingBsIsAccount = false;
    dom.balanceName.value = "";
    dom.balanceType.value = "account";
    dom.balanceCategoryWrap.classList.add("d-none");
    dom.balanceCategory.value = "asset";
    dom.balanceAmount.value = "";
    dom.balanceEmergency.checked = false;
    ui.setBalanceSheetEditMode({ active: false });
  };

  const resetWishForm = () => {
    editingWishId = null;
    dom.wishName.value = "";
    dom.wishPrice.value = "";
    ui.setWishEditMode({ active: false });
  };

  const validateFundForm = (values, submitLabel) => {
    if (!values.name) {
      ui.toast.show("請輸入準備項目名稱", "error");
      return false;
    }
    if (values.targetAmount <= 0) {
      ui.toast.show("目標金額必須大於 0", "error");
      return false;
    }
    if (values.monthlyContribution <= 0) {
      ui.toast.show("每月提撥必須大於 0", "error");
      return false;
    }
    if (!values.startMonth) {
      ui.toast.show("請選擇開始月份", "error");
      return false;
    }
    if (values.targetMonth && values.targetMonth < values.startMonth) {
      ui.toast.show("目標月份不能早於開始月份", "error");
      return false;
    }

    if (values.targetMonth) {
      const planStatus = getFundTargetPlanStatus(values);
      if (!planStatus.isFeasible) {
        const shouldContinue = window.confirm(
          `照目前設定，每月提撥 ${values.monthlyContribution}，到 ${values.targetMonth} 預計只能累積 ${planStatus.plannedAmount}。\n` +
            `距離目標 ${values.targetAmount} 還差 ${planStatus.shortfall}。\n\n` +
            "你可以延後目標月份、提高每月提撥，或之後用手動補入補足。\n\n" +
            `仍要${submitLabel}嗎？`,
        );
        if (!shouldContinue) return false;
      }
    }

    return true;
  };

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
      ui.renderTransactionCategorySelect();
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
      ui.renderTransactionCategorySelect();
      ui.populateCategoryBudgetOptions();
      dom.inputCategory.value = cleanName;
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
      const editingTx = editingTxId ? state.txs.find((item) => item.id === editingTxId) : null;
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
        subcategory: "未分類",
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
          draft.txs = draft.txs.map((item) => (item.id === editingTx.id ? tx : item));
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
      const tx = state.txs.find((item) => item.id === id);
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
      ui.renderTransactionCategorySelect();
      ui.populateFundOptions();
      ui.setTransactionEditMode({ active: true, linkedFundName, advanceRepaidAmount });

      dom.inputAmount.value = tx.amount ?? "";
      dom.inputDesc.value = tx.desc || "";
      dom.inputDate.value = tx.date || "";
      dom.inputCategory.value = tx.cat || "";

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
        const target = draft.txs.find((tx) => tx.id === id);
        draft.txs = draft.txs.filter((tx) => tx.id !== id && !(target?.type === "advance" && tx.type === "advance_repayment" && String(tx.advanceId) === String(id)));
        draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, id);
      });
      context.saveState();
      renderAll();
      ui.toast.show("已刪除交易");
    },

    repayAdvance(id) {
      const state = store.getState();
      const advance = getOpenAdvances(state.txs).find((tx) => tx.id === id);
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
      const repayment = state.txs.find((tx) => tx.id === id && tx.type === "advance_repayment");
      if (!repayment) {
        ui.toast.show("找不到這筆代墊收款", "error");
        return;
      }

      const advance = state.txs.find((tx) => tx.id === repayment.advanceId && tx.type === "advance");
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
        const target = draft.txs.find((tx) => tx.id === id);
        if (!target) return;
        target.amount = amount;
        target.date = rawDate;
        target.acc = account.id;
      });
      context.saveState();
      renderAll();
      ui.toast.show("已更新代墊收款");
    },

    addFund() {
      const values = readFundFormValues();
      if (!validateFundForm(values, editingFundId ? "儲存這個設定" : "先建立這個準備項目")) return;

      store.update((draft) => {
        if (editingFundId) {
          const fund = draft.sinkingFunds.find((item) => item.id === editingFundId);
          if (!fund) return;
          Object.assign(fund, values);
        } else {
          draft.sinkingFunds.push({
            id: createClientId("sf"),
            ...values,
            events: [],
          });
        }
      });

      const wasEditing = !!editingFundId;
      resetFundForm();
      context.saveState();
      ui.populateFundOptions();
      renderWishlist();
      ui.toast.show(wasEditing ? "已更新大額支出準備" : "已新增大額支出準備");
    },

    beginEditFund(id) {
      const fund = store.getState().sinkingFunds.find((item) => item.id === id);
      if (!fund) {
        ui.toast.show("找不到這個大額支出準備", "error");
        return;
      }

      editingFundId = id;
      this.switchTab("wl");
      ui.setFundEditMode({ active: true });
      dom.fundName.value = fund.name || "";
      dom.fundCategory.value = fund.category || "";
      dom.fundTarget.value = fund.targetAmount ?? "";
      dom.fundMonthly.value = fund.monthlyContribution ?? "";
      dom.fundStart.value = fund.startMonth || "";
      dom.fundTargetMonth.value = fund.targetMonth || "";
      dom.fundNote.value = fund.note || "";
      dom.fundCarry.checked = !!fund.carryoverEnabled;
      dom.root.getElementById("form-fund")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    cancelEditFund() {
      resetFundForm();
      ui.toast.show("已取消編輯");
    },

    delFund(id) {
      const fund = store.getState().sinkingFunds.find((item) => item.id === id);
      if (!fund) return;
      if (!window.confirm(`確定要刪除「${fund.name}」嗎？`)) return;

      store.update((draft) => {
        draft.sinkingFunds = draft.sinkingFunds.filter((item) => item.id !== id);
        draft.txs.forEach((tx) => {
          if (tx.linkedFundId === id) delete tx.linkedFundId;
        });
      });
      context.saveState();
      ui.populateFundOptions();
      renderWishlist();
      ui.toast.show("已刪除大額支出準備");
    },

    topupFund(id) {
      const state = store.getState();
      const fund = state.sinkingFunds.find((item) => item.id === id);
      if (!fund) {
        ui.toast.show("找不到這個大額支出準備", "error");
        return;
      }

      const rawAmount = window.prompt(`這次要補入「${fund.name}」多少？`, String(fund.monthlyContribution || 0));
      if (rawAmount === null) return;
      const amount = toMoneyInt(rawAmount);
      if (amount <= 0) {
        ui.toast.show("補入金額必須大於 0", "error");
        return;
      }

      const topupDate = localDateStr(new Date());
      const monthRange = buildMonthRange(topupDate);
      const budget = monthRange ? calculateBudgetData(state, monthRange) : null;
      const availableFreedom = budget?.freeToUse || 0;
      if (amount > availableFreedom) {
        ui.toast.show(`本月可自由運用只有 ${availableFreedom}，這次最多只能補入 ${availableFreedom}。`, "error");
        return;
      }

      const note = window.prompt("這次補入要加備註嗎？可留空", "手動補入") ?? "";

      store.update((draft) => {
        const target = draft.sinkingFunds.find((item) => item.id === id);
        if (!target) return;
        if (!Array.isArray(target.events)) target.events = [];
        target.events.push({
          id: createFundEventId(),
          type: "topup",
          amount,
          date: topupDate,
          note: note.trim(),
        });
      });

      context.saveState();
      renderWishlist();
      ui.toast.show("已補入準備項目");
    },

    openFund(id) {
      const fund = store.getState().sinkingFunds.find((item) => item.id === id);
      if (!fund) {
        ui.toast.show("找不到對應的大額支出準備", "error");
        return;
      }

      this.switchTab("wl");
      renderWishlist();

      requestAnimationFrame(() => {
        const card = dom.root.querySelector(`[data-fund-card="${escapeCssValue(id)}"]`);
        if (!card) return;
        card.open = true;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },

    addBs() {
      const amount = toMoneyInt(dom.balanceAmount.value);
      if (amount < 0) {
        ui.toast.show("金額不能小於 0", "error");
        return;
      }

      store.update((draft) => {
        if (editingBsId) {
          if (editingBsIsAccount) {
            const account = draft.accounts.find((item) => String(item.id) === String(editingBsId));
            if (!account) return;
            account.name = dom.balanceName.value.trim();
            account.initialBalance = amount;
            account.isEm = dom.balanceEmergency.checked;
          } else {
            const item = draft.bsI.find((entry) => String(entry.id) === String(editingBsId));
            if (!item) return;
            item.name = dom.balanceName.value.trim();
            item.amount = amount;
            item.cat = dom.balanceCategory.value;
            item.isEm = dom.balanceEmergency.checked;
          }
        } else if (dom.balanceType.value === "account") {
          draft.accounts.push({
            id: createClientId("a"),
            name: dom.balanceName.value.trim(),
            type: "asset",
            isEm: dom.balanceEmergency.checked,
            initialBalance: amount,
          });
        } else {
          draft.bsI.push({
            id: createClientId("bs"),
            name: dom.balanceName.value.trim(),
            amount,
            cat: dom.balanceCategory.value,
            isEm: dom.balanceEmergency.checked,
          });
        }
      });

      const wasEditing = !!editingBsId;
      resetBalanceSheetForm();
      context.saveState();
      renderAll();
      ui.toast.show(wasEditing ? "已儲存資產負債修改" : "已新增資產 / 負債項目");
    },

    beginEditBs(id, isAccount) {
      const state = store.getState();
      const item = isAccount
        ? state.accounts.find((entry) => String(entry.id) === String(id))
        : state.bsI.find((entry) => String(entry.id) === String(id));
      if (!item) {
        ui.toast.show("找不到要編輯的項目", "error");
        return;
      }

      editingBsId = String(id);
      editingBsIsAccount = isAccount;
      this.switchTab("bs");
      ui.setBalanceSheetEditMode({ active: true, isAccount });
      dom.balanceType.value = isAccount ? "account" : "item";
      dom.balanceCategoryWrap.classList.toggle("d-none", isAccount);
      dom.balanceName.value = item.name || "";
      dom.balanceAmount.value = isAccount ? item.initialBalance ?? "" : item.amount ?? "";
      dom.balanceEmergency.checked = !!item.isEm;
      if (!isAccount) dom.balanceCategory.value = item.cat || "asset";
      dom.root.getElementById("form-bs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    cancelEditBs() {
      resetBalanceSheetForm();
      ui.toast.show("已取消編輯");
    },

    delBs(id, isAccount) {
      if (!window.confirm("確定要刪除這個項目嗎？")) return;
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

    addWish() {
      const price = toMoneyInt(dom.wishPrice.value);
      if (price <= 0) {
        ui.toast.show("金額必須大於 0", "error");
        return;
      }

      store.update((draft) => {
        if (editingWishId !== null) {
          const wish = draft.wishes.find((item) => String(item.id) === String(editingWishId));
          if (!wish) return;
          wish.name = dom.wishName.value.trim();
          wish.price = price;
          wish.cat = dom.wishCategory.value;
        } else {
          draft.wishes.push({
            id: createClientId("wish"),
            name: dom.wishName.value.trim(),
            price,
            cat: dom.wishCategory.value,
          });
        }
      });
      const wasEditing = editingWishId !== null;
      resetWishForm();
      context.saveState();
      renderWishlist();
      ui.toast.show(wasEditing ? "已儲存待購項目修改" : "已加入待購清單");
    },

    beginEditWish(id) {
      const wish = store.getState().wishes.find((item) => String(item.id) === String(id));
      if (!wish) {
        ui.toast.show("找不到要編輯的待購項目", "error");
        return;
      }
      editingWishId = id;
      this.switchTab("wl");
      ui.setWishEditMode({ active: true });
      dom.wishName.value = wish.name || "";
      dom.wishPrice.value = wish.price ?? "";
      dom.wishCategory.value = wish.cat || "";
      dom.root.getElementById("form-wish")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    cancelEditWish() {
      resetWishForm();
      ui.toast.show("已取消編輯");
    },

    delWish(id) {
      store.update((draft) => {
        draft.wishes = draft.wishes.filter((wish) => String(wish.id) !== String(id));
      });
      context.saveState();
      renderWishlist();
    },

    mvWish(id, dir) {
      store.update((draft) => {
        const index = draft.wishes.findIndex((wish) => String(wish.id) === String(id));
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
