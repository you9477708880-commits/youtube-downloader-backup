import { calculateBudgetData } from "../../domain/budget.js";
import {
  buildAdvanceRepayment,
  buildTransaction,
  getAdvanceOutstanding,
  getAdvanceRepaidAmount,
  getOpenAdvances,
} from "../../domain/transactions.js";
import { getFundAvailableBeforeExpense, withoutFundEventsLinkedToTransaction } from "../../domain/sinking-funds.js";
import { DEFAULT_SUBCATEGORY } from "../../config/constants.js";
import { localDateStr, toMoneyInt } from "../../utils/format.js";

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

export function createTransactionController({
  elements,
  store,
  toast,
  setEditMode,
  commitState,
  renderAll,
  navigate,
  syncTxType,
  renderTransactionCategorySelect,
  populateTransactionSubcategoryOptions,
  populateFundOptions,
  populateCategoryBudgetOptions,
  askFundShortfallChoice,
  constants,
  confirmDelete = (message) => globalThis.window.confirm(message),
  promptInput = (message, defaultValue) => globalThis.window.prompt(message, defaultValue),
  now = () => new Date(),
}) {
  const {
    root,
    amount,
    ownAmount,
    advancePerson,
    fund,
    subcategory,
    description,
    date,
    category,
    account,
    fromAccount,
    toAccount,
  } = elements;
  let editingTxId = null;
  let editingOriginalLinkedFundId = "";

  const sameId = (left, right) => String(left) === String(right);

  const reset = () => {
    editingTxId = null;
    editingOriginalLinkedFundId = "";
    amount.value = "";
    if (ownAmount) ownAmount.value = "";
    if (advancePerson) advancePerson.value = "";
    if (fund) fund.value = "";
    if (subcategory) subcategory.value = "";
    description.value = "";
    setEditMode({ active: false });
  };

  const getEditableBaseState = (state) =>
    editingTxId
      ? {
          ...state,
          txs: state.txs.filter((tx) => !sameId(tx.id, editingTxId)),
          sinkingFunds: withoutFundEventsLinkedToTransaction(state.sinkingFunds, editingTxId),
        }
      : state;

  const setTxType = (type) => {
    if (editingTxId) return;
    store.update((state) => {
      state.txType = type;
    });
    syncTxType();
    renderTransactionCategorySelect({ resetSubcategory: true });
    populateFundOptions();
  };

  const addCustomCat = () => {
    const state = store.getState();
    const typeLabel = state.txType === "income" ? "收入" : "支出";
    const name = promptInput(`請輸入新的${typeLabel}分類名稱`);
    if (!name?.trim()) return;

    const cleanName = name.trim();
    const baseList = state.txType === "income" ? constants.incomeCategories : constants.expenseCategories;
    if (state.userCats[state.txType].includes(cleanName) || baseList.includes(cleanName)) {
      toast.show("這個分類已經存在", "error");
      return;
    }

    commitState((draft) => {
      draft.userCats[draft.txType].push(cleanName);
    }, {
      updateUi: () => {
        renderTransactionCategorySelect({ resetSubcategory: true });
        populateCategoryBudgetOptions();
        category.value = cleanName;
        populateTransactionSubcategoryOptions({ reset: true });
      },
    });
    toast.show(`已新增分類：${cleanName}`);
  };

  const addTx = async () => {
    const normalizedAmount = toMoneyInt(amount.value);
    if (normalizedAmount <= 0) {
      toast.show("金額必須大於 0", "error");
      return;
    }

    const state = store.getState();
    const editingTx = editingTxId ? state.txs.find((item) => sameId(item.id, editingTxId)) : null;
    const baseState = getEditableBaseState(state);
    const linkedFundId = state.txType === "expense" ? fund?.value || "" : "";
    const linkedFund = linkedFundId ? baseState.sinkingFunds.find((item) => item.id === linkedFundId) : null;
    if (linkedFundId && !linkedFund) {
      toast.show("找不到對應的大額準備項目", "error");
      return;
    }

    const tx = buildTransaction({
      txType: state.txType,
      amount: normalizedAmount,
      desc: description.value,
      date: date.value,
      category: category.value,
      subcategory: subcategory?.value.trim() || DEFAULT_SUBCATEGORY,
      accountId: account.value,
      fromAcc: fromAccount.value,
      toAcc: toAccount.value,
      ownAmount: toMoneyInt(ownAmount?.value),
      person: advancePerson?.value || "",
      budgetMode: "normal",
      linkedFundId,
    });
    if (editingTx) tx.id = editingTx.id;

    if (tx.type === "transfer" && tx.fromAcc === tx.toAcc) {
      toast.show("轉出與轉入帳戶不能相同", "error");
      return;
    }

    if (tx.type === "advance") {
      if (tx.ownAmount > tx.amount) {
        toast.show("自己負擔金額不能大於總金額", "error");
        return;
      }
      if (tx.receivableAmount <= 0) {
        toast.show("代墊至少要有一部分是別人應還的金額", "error");
        return;
      }
      const alreadyRepaid = editingTx ? getAdvanceRepaidAmount(state.txs, editingTx.id) : 0;
      if (tx.receivableAmount < alreadyRepaid) {
        toast.show(`修改後應收款只有 ${tx.receivableAmount}，不能低於已收回的 ${alreadyRepaid}。`, "error");
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
        const choice = await askFundShortfallChoice({
          fundName: linkedFund.name,
          availableFromFund,
          amount: tx.amount,
          shortfall,
          availableFreedom,
        });

        if (!choice) return;

        if (choice === "topup") {
          if (availableFreedom < shortfall) {
            toast.show(`本月可自由運用只有 ${availableFreedom}，不足以補差額 ${shortfall}。`, "error");
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

    commitState((draft) => {
      if (editingTx) {
        draft.txs = draft.txs.map((item) => (sameId(item.id, editingTx.id) ? tx : item));
        draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, editingTx.id);
      } else {
        draft.txs.unshift(tx);
      }

      if (tx.type === "expense" && effectiveLinkedFundId && fundSpendAmount > 0) {
        const targetFund = draft.sinkingFunds.find((item) => item.id === effectiveLinkedFundId);
        if (targetFund) {
          if (!Array.isArray(targetFund.events)) targetFund.events = [];
          if (topupAmount > 0) {
            targetFund.events.push({
              id: createFundEventId(),
              type: "topup",
              amount: topupAmount,
              date: tx.date,
              note: "用本月可自由運用補足差額",
              linkedTxId: tx.id,
            });
          }
          targetFund.events.push({
            id: createFundEventId(),
            type: "spend",
            amount: fundSpendAmount,
            date: tx.date,
            note: tx.desc || tx.cat,
            linkedTxId: tx.id,
          });
        }
      }
    }, {
      updateUi: () => {
        reset();
        renderAll();
      },
    });
    if (editingTx && !effectiveLinkedFundId && editingOriginalLinkedFundId) {
      toast.show("已更新交易，原本的大額準備指定已移除");
    } else if (editingTx && effectiveLinkedFundId && topupAmount > 0) {
      toast.show(`已更新交易，並用本月可自由運用補足 ${topupAmount}`);
    } else if (editingTx && effectiveLinkedFundId && fundSpendAmount > 0 && fundSpendAmount < tx.amount) {
      toast.show(`已更新交易，準備金支付 ${fundSpendAmount}，剩餘 ${tx.amount - fundSpendAmount} 算本月支出`);
    } else if (editingTx && effectiveLinkedFundId) {
      toast.show("已更新交易並記錄到大額準備");
    } else if (editingTx) {
      toast.show("已更新交易");
    } else if (effectiveLinkedFundId && topupAmount > 0) {
      toast.show(`已新增交易，並用本月可自由運用補足 ${topupAmount}`);
    } else if (effectiveLinkedFundId && fundSpendAmount > 0 && fundSpendAmount < tx.amount) {
      toast.show(`已新增交易，準備金支付 ${fundSpendAmount}，剩餘 ${tx.amount - fundSpendAmount} 算本月支出`);
    } else if (effectiveLinkedFundId) {
      toast.show("已新增交易並記錄到大額準備");
    } else {
      toast.show("已新增交易");
    }
    navigate("ov");
  };

  const beginEditTx = (id) => {
    const state = store.getState();
    const tx = state.txs.find((item) => sameId(item.id, id));
    if (!tx) {
      toast.show("找不到這筆交易", "error");
      return;
    }
    if (!["income", "expense", "transfer", "advance"].includes(tx.type)) {
      toast.show("這種交易目前不能用這個表單編輯", "error");
      return;
    }

    editingTxId = tx.id;
    editingOriginalLinkedFundId = tx.linkedFundId || "";
    const linkedFundName = editingOriginalLinkedFundId
      ? state.sinkingFunds.find((item) => item.id === editingOriginalLinkedFundId)?.name || ""
      : "";
    const advanceRepaidAmount = tx.type === "advance" ? getAdvanceRepaidAmount(state.txs, tx.id) : 0;

    navigate("lg");
    store.update((draft) => {
      draft.txType = tx.type;
    });
    syncTxType();
    renderTransactionCategorySelect({ resetSubcategory: true });
    populateFundOptions();
    setEditMode({ active: true, linkedFundName, advanceRepaidAmount });

    amount.value = tx.amount ?? "";
    description.value = tx.desc || "";
    date.value = tx.date || "";
    const transactionCategory = tx.category || tx.cat || "";
    if (transactionCategory && ![...category.options].some((option) => option.value === transactionCategory)) {
      category.append(new Option(transactionCategory, transactionCategory));
    }
    category.value = transactionCategory;
    populateTransactionSubcategoryOptions();
    if (subcategory) subcategory.value = tx.subcategory || DEFAULT_SUBCATEGORY;

    if (tx.type === "transfer") {
      fromAccount.value = tx.fromAcc || "";
      toAccount.value = tx.toAcc || "";
    } else {
      account.value = tx.acc || "";
    }
    if (tx.type === "advance") {
      ownAmount.value = tx.ownAmount ?? "";
      advancePerson.value = tx.person || "";
    }

    if (fund) fund.value = "";

    root.getElementById("form-tx")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEditTx = () => {
    reset();
    syncTxType();
    renderTransactionCategorySelect();
    populateFundOptions();
    toast.show("已取消編輯");
  };

  const delTx = (id) => {
    if (!confirmDelete("確定要刪除這筆交易嗎？")) return;
    commitState((draft) => {
      const target = draft.txs.find((tx) => sameId(tx.id, id));
      draft.txs = draft.txs.filter((tx) => !sameId(tx.id, id) && !(target?.type === "advance" && tx.type === "advance_repayment" && sameId(tx.advanceId, id)));
      draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, id);
    }, { updateUi: renderAll });
    toast.show("已刪除交易");
  };

  const repayAdvance = (id) => {
    const state = store.getState();
    const advance = getOpenAdvances(state.txs).find((tx) => sameId(tx.id, id));
    if (!advance) {
      toast.show("找不到這筆尚未收回的代墊", "error");
      return;
    }

    const rawAmount = promptInput(`這次收回多少？尚未收回 ${advance.outstandingAmount}`, String(advance.outstandingAmount));
    if (rawAmount === null) return;
    const repaymentAmount = toMoneyInt(rawAmount);
    if (repaymentAmount <= 0 || repaymentAmount > getAdvanceOutstanding(state.txs, advance)) {
      toast.show("收回金額不正確", "error");
      return;
    }

    const accountMenu = state.accounts.map((item, index) => `${index + 1}. ${item.name}`).join("\n");
    const rawIndex = promptInput(`收款到哪個帳戶？\n${accountMenu}`, "1");
    if (rawIndex === null) return;
    const repaymentAccount = state.accounts[Math.max(0, Math.min(state.accounts.length - 1, Number(rawIndex) - 1))];
    if (!repaymentAccount) {
      toast.show("沒有選到有效帳戶", "error");
      return;
    }

    const repayment = buildAdvanceRepayment({
      advanceId: advance.id,
      amount: repaymentAmount,
      date: localDateStr(now()),
      accountId: repaymentAccount.id,
      person: advance.person,
    });

    commitState((draft) => {
      draft.txs.unshift(repayment);
    }, { updateUi: renderAll });
    toast.show("已登記收款");
  };

  const editAdvanceRepayment = (id) => {
    const state = store.getState();
    const repayment = state.txs.find((tx) => sameId(tx.id, id) && tx.type === "advance_repayment");
    if (!repayment) {
      toast.show("找不到這筆代墊收款", "error");
      return;
    }

    const advance = state.txs.find((tx) => sameId(tx.id, repayment.advanceId) && tx.type === "advance");
    if (!advance) {
      toast.show("找不到這筆收款對應的代墊", "error");
      return;
    }

    const maxAmount = Math.max(0, (advance.receivableAmount || 0) - getAdvanceRepaidAmount(state.txs, advance.id, repayment.id));
    const rawAmount = promptInput(`修改這次收回多少？最多 ${maxAmount}`, String(repayment.amount));
    if (rawAmount === null) return;
    const repaymentAmount = toMoneyInt(rawAmount);
    if (repaymentAmount <= 0 || repaymentAmount > maxAmount) {
      toast.show("收回金額不正確", "error");
      return;
    }

    const rawDate = promptInput("這次收款日期？", repayment.date || localDateStr(now()));
    if (rawDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      toast.show("日期格式不正確", "error");
      return;
    }

    const accountMenu = state.accounts.map((item, index) => `${index + 1}. ${item.name}`).join("\n");
    const currentIndex = Math.max(0, state.accounts.findIndex((item) => item.id === repayment.acc));
    const rawIndex = promptInput(`收款到哪個帳戶？\n${accountMenu}`, String(currentIndex + 1));
    if (rawIndex === null) return;
    const repaymentAccount = state.accounts[Math.max(0, Math.min(state.accounts.length - 1, Number(rawIndex) - 1))];
    if (!repaymentAccount) {
      toast.show("沒有選到有效帳戶", "error");
      return;
    }

    commitState((draft) => {
      const target = draft.txs.find((tx) => sameId(tx.id, id));
      if (!target) return;
      target.amount = repaymentAmount;
      target.date = rawDate;
      target.acc = repaymentAccount.id;
    }, { updateUi: renderAll });
    toast.show("已更新代墊收款");
  };

  return {
    setTxType,
    addCustomCat,
    addTx,
    beginEditTx,
    cancelEditTx,
    delTx,
    repayAdvance,
    editAdvanceRepayment,
    reset,
  };
}
