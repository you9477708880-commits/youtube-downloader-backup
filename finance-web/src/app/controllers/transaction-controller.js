import {
  getAdvanceOutstanding,
  getAdvanceRepaidAmount,
  getOpenAdvances,
} from "../../domain/transactions.js";
import {
  applyDeleteTransaction,
  applyDetailTransaction,
  applyMainTransaction,
  planFundAllocation,
  prepareAdvanceRepaymentEdit,
  prepareDetailTransaction,
  prepareMainTransaction,
  prepareNewAdvanceRepayment,
  sameTransactionId,
} from "../../domain/transaction-commands.js";
import { DEFAULT_SUBCATEGORY } from "../../config/constants.js";
import { prepareRepeatTransaction } from "../../domain/transaction-repeat.js";
import { localDateStr, toMoneyInt } from "../../utils/format.js";

function createClientId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createFundEventId() {
  return createClientId("fe");
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
  confirmDiscard = (message) => globalThis.window.confirm(message),
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
  let repeatDraft = false;
  let repeatSelection = null;
  let draftDirty = false;
  let draftGeneration = 0;
  let saving = false;

  const sameId = sameTransactionId;

  const reset = () => {
    draftGeneration += 1;
    repeatDraft = false;
    repeatSelection = null;
    draftDirty = false;
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

  const setTxType = (type) => {
    if (editingTxId !== null) return;
    if (store.getState().txType !== type) draftDirty = true;
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
        markDraftDirty({ target: category });
      },
    });
    toast.show(`已新增分類：${cleanName}`);
  };

  const saveTx = async (generation) => {
    const state = store.getState();
    if (repeatDraft && (repeatSelection?.accountId !== account.value || repeatSelection?.category !== category.value
      || !state.accounts.some((item) => sameId(item.id, account.value) && item.enabled !== false)
      || !category.value || ![...category.options].some((option) => option.value === category.value && !option.disabled))) {
      toast.show("請重新選擇有效帳戶與分類", "error");
      return;
    }
    const prepared = prepareMainTransaction({
      state,
      editingTxId,
      input: {
        amount: amount.value,
        desc: description.value,
        date: date.value,
        category: category.value,
        subcategory: subcategory?.value,
        accountId: account.value,
        fromAcc: fromAccount.value,
        toAcc: toAccount.value,
        ownAmount: ownAmount?.value,
        person: advancePerson?.value,
        linkedFundId: fund?.value,
      },
    });
    if (!prepared.ok) {
      toast.show(prepared.message, "error");
      return;
    }

    let allocation = planFundAllocation(prepared);
    if (allocation.needsChoice) {
      const choice = await askFundShortfallChoice(allocation.request);
      if (generation !== draftGeneration) return;
      if (editingTxId !== null && !store.getState().txs.some((item) => sameId(item.id, editingTxId))) {
        toast.show("這筆交易已不存在，無法儲存編輯，也不會重新新增。", "error");
        return;
      }
      allocation = planFundAllocation({ ...prepared, choice });
    }
    if (!allocation.ok) {
      if (!allocation.cancelled) toast.show(allocation.message, "error");
      return;
    }

    const command = { ...prepared, ...allocation, tx: allocation.tx };
    commitState((draft) => {
      applyMainTransaction(draft, command, createFundEventId);
    }, {
      updateUi: () => {
        reset();
        renderAll();
      },
    });

    const { editingTx, effectiveLinkedFundId, topupAmount, fundSpendAmount, tx } = command;
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

  const addTx = async () => {
    if (saving) return;
    saving = true;
    try {
      await saveTx(draftGeneration);
    } finally {
      saving = false;
    }
  };

  const markDraftDirty = (event) => {
    draftDirty = true;
    if (repeatSelection && event?.target === account) repeatSelection.accountId = account.value;
    if (repeatSelection && event?.target === category) repeatSelection.category = category.value;
  };
  const beginRepeatTx = (id) => {
    const prepared = prepareRepeatTransaction({ state: store.getState(), id, date: localDateStr(now()) });
    if (!prepared.ok) { toast.show(prepared.message, "error"); return false; }
    const hasDraft = draftDirty || editingTxId !== null || repeatDraft
      || [amount, description, ownAmount, advancePerson, fund].some((element) => String(element?.value || "").trim());
    if (hasDraft && !confirmDiscard("目前有尚未儲存的交易草稿。要放棄草稿並帶入這筆內容嗎？")) return false;
    reset();
    repeatDraft = true;
    const input = prepared.input;
    store.update((draft) => { draft.txType = input.type; });
    navigate("lg");
    syncTxType();
    renderTransactionCategorySelect({ resetSubcategory: true });
    populateFundOptions();
    amount.value = input.amount;
    description.value = input.desc;
    date.value = input.date;
    category.value = [...category.options].some((option) => option.value === input.category && !option.disabled) ? input.category : "";
    populateTransactionSubcategoryOptions();
    if (subcategory) subcategory.value = input.subcategory;
    account.value = input.accountId;
    repeatSelection = { accountId: account.value, category: category.value };
    setEditMode({ active: false, repeatDraft: true });
    if (!input.accountId || !category.value) toast.show("原帳戶或分類已不可用，請重新選擇後再儲存", "error");
    root.getElementById("form-tx")?.scrollIntoView({ behavior: "smooth", block: "start" });
    amount.focus?.();
    return true;
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
    draftGeneration += 1;
    repeatDraft = false;
    repeatSelection = null;
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
    const wasRepeat = repeatDraft;
    reset();
    syncTxType();
    renderTransactionCategorySelect();
    populateFundOptions();
    toast.show(wasRepeat ? "已取消新增，原交易未變更" : "已取消編輯");
  };

  const updateTransactionFromDetail = async (id, input) => {
    const state = store.getState();
    const original = state.txs.find((item) => sameId(item.id, id));
    if (!original) {
      toast.show("找不到這筆交易", "error");
      return false;
    }

    const command = prepareDetailTransaction({ state, original, input });
    if (!command.ok) {
      toast.show(command.message, "error");
      return false;
    }
    const clearsActiveMainEditor = editingTxId !== null && sameId(editingTxId, original.id);
    commitState((draft) => {
      applyDetailTransaction(draft, command);
    }, {
      updateUi: () => {
        if (clearsActiveMainEditor) {
          reset();
          syncTxType();
          renderTransactionCategorySelect();
          populateFundOptions();
        }
        renderAll();
      },
    });

    if (command.mode === "repayment") {
      toast.show("已更新代墊收款");
    } else if (original.linkedFundId && !command.keepsFundLink) {
      toast.show("已更新交易，原本的大額準備指定已移除");
    } else {
      toast.show("已更新交易");
    }
    return true;
  };
  const delTx = (id) => {
    const target = store.getState().txs.find((tx) => sameId(tx.id, id));
    if (!target) {
      toast.show("找不到這筆交易", "error");
      return false;
    }
    const message = target.type === "balance_adjustment"
      ? "確定要刪除這筆帳戶調整嗎？刪除後，帳戶餘額會回到調整前的計算結果。"
      : "確定要刪除這筆交易嗎？";
    if (!confirmDelete(message)) return false;
    commitState((draft) => {
      applyDeleteTransaction(draft, target);
    }, { updateUi: () => {
      if (editingTxId !== null && !store.getState().txs.some((tx) => sameId(tx.id, editingTxId))) reset();
      renderAll();
    } });
    toast.show(target.type === "balance_adjustment" ? "已刪除帳戶調整，帳戶餘額已重新計算" : "已刪除交易");
    return true;
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

    const command = prepareNewAdvanceRepayment({
      state,
      advanceId: advance.id,
      amount: repaymentAmount,
      date: localDateStr(now()),
      accountId: repaymentAccount.id,
    });
    if (!command.ok) {
      toast.show(command.message, "error");
      return;
    }

    commitState((draft) => {
      draft.txs.unshift(command.repayment);
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

    const command = prepareAdvanceRepaymentEdit({
      state,
      repaymentId: id,
      amount: repaymentAmount,
      date: rawDate,
      accountId: repaymentAccount.id,
    });
    if (!command.ok) {
      toast.show(command.message, "error");
      return;
    }

    commitState((draft) => {
      const target = draft.txs.find((tx) => sameId(tx.id, id));
      if (!target) return;
      Object.assign(target, command.changes);
    }, { updateUi: renderAll });
    toast.show("已更新代墊收款");
  };

  return {
    setTxType,
    addCustomCat,
    addTx,
    beginEditTx,
    beginRepeatTx,
    markDraftDirty,
    cancelEditTx,
    delTx,
    repayAdvance,
    editAdvanceRepayment,
    updateTransactionFromDetail,
    reset,
  };
}
