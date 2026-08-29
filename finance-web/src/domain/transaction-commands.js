import { DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { toMoneyInt } from "../utils/format.js";
import { calculateBudgetData } from "./budget.js";
import {
  buildAdvanceRepayment,
  buildTransaction,
  getAdvanceOutstanding,
  getAdvanceRepaidAmount,
  getOpenAdvances,
} from "./transactions.js";
import { getFundAvailableBeforeExpense, withoutFundEventsLinkedToTransaction } from "./sinking-funds.js";

export const sameTransactionId = (left, right) => String(left) === String(right);

function failure(code, message) {
  return { ok: false, code, message };
}

function buildMonthRange(date) {
  const month = String(date || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  const endDay = new Date(year, monthIndex, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(endDay).padStart(2, "0")}` };
}

function editableBaseState(state, editingTxId) {
  if (!editingTxId) return state;
  return {
    ...state,
    txs: state.txs.filter((tx) => !sameTransactionId(tx.id, editingTxId)),
    sinkingFunds: withoutFundEventsLinkedToTransaction(state.sinkingFunds, editingTxId),
  };
}

export function prepareMainTransaction({ state, editingTxId = null, input }) {
  const normalizedAmount = toMoneyInt(input?.amount);
  if (normalizedAmount <= 0) return failure("invalid_amount", "金額必須大於 0");

  const editingTx = editingTxId
    ? state.txs.find((item) => sameTransactionId(item.id, editingTxId)) || null
    : null;
  const baseState = editableBaseState(state, editingTxId);
  const linkedFundId = state.txType === "expense" ? String(input?.linkedFundId || "") : "";
  const linkedFund = linkedFundId
    ? baseState.sinkingFunds.find((item) => sameTransactionId(item.id, linkedFundId)) || null
    : null;
  if (linkedFundId && !linkedFund) return failure("missing_fund", "找不到對應的大額準備項目");

  const tx = buildTransaction({
    txType: state.txType,
    amount: normalizedAmount,
    desc: input?.desc,
    date: input?.date,
    category: input?.category,
    subcategory: String(input?.subcategory || "").trim() || DEFAULT_SUBCATEGORY,
    accountId: input?.accountId,
    fromAcc: input?.fromAcc,
    toAcc: input?.toAcc,
    ownAmount: toMoneyInt(input?.ownAmount),
    person: input?.person || "",
    budgetMode: "normal",
    linkedFundId,
  });
  if (editingTx) tx.id = editingTx.id;

  if (tx.type === "transfer" && sameTransactionId(tx.fromAcc, tx.toAcc)) {
    return failure("same_transfer_account", "轉出與轉入帳戶不能相同");
  }
  if (tx.type === "advance") {
    if (tx.ownAmount > tx.amount) return failure("advance_own_exceeds_total", "自己負擔金額不能大於總金額");
    if (tx.receivableAmount <= 0) return failure("advance_without_receivable", "代墊至少要有一部分是別人應還的金額");
    const alreadyRepaid = editingTx ? getAdvanceRepaidAmount(state.txs, editingTx.id) : 0;
    if (tx.receivableAmount < alreadyRepaid) {
      return failure("advance_below_repaid", `修改後應收款只有 ${tx.receivableAmount}，不能低於已收回的 ${alreadyRepaid}。`);
    }
  }

  return { ok: true, tx, editingTx, baseState, linkedFundId, linkedFund };
}

export function planFundAllocation({ baseState, tx, linkedFundId = "", linkedFund = null, choice }) {
  if (tx.type !== "expense" || !linkedFund) {
    return { ok: true, tx, effectiveLinkedFundId: "", topupAmount: 0, fundSpendAmount: 0 };
  }
  const availableFromFund = getFundAvailableBeforeExpense(linkedFund, tx.date, tx.id);
  if (availableFromFund >= tx.amount) {
    return { ok: true, tx, effectiveLinkedFundId: linkedFundId, topupAmount: 0, fundSpendAmount: tx.amount };
  }

  const shortfall = tx.amount - availableFromFund;
  const monthRange = buildMonthRange(tx.date);
  const budget = monthRange ? calculateBudgetData(baseState, monthRange) : null;
  const availableFreedom = budget?.freeToUse || 0;
  const request = { fundName: linkedFund.name, availableFromFund, amount: tx.amount, shortfall, availableFreedom };
  if (choice === undefined) return { ok: true, needsChoice: true, request };
  if (!choice) return { ok: false, cancelled: true, code: "fund_choice_cancelled" };

  if (choice === "topup") {
    if (availableFreedom < shortfall) {
      return failure("fund_topup_exceeds_freedom", `本月可自由運用只有 ${availableFreedom}，不足以補差額 ${shortfall}。`);
    }
    return { ok: true, tx, effectiveLinkedFundId: linkedFundId, topupAmount: shortfall, fundSpendAmount: tx.amount };
  }
  if (choice === "partial") {
    const fundSpendAmount = Math.min(availableFromFund, tx.amount);
    if (fundSpendAmount <= 0) {
      const next = { ...tx };
      delete next.linkedFundId;
      return { ok: true, tx: next, effectiveLinkedFundId: "", topupAmount: 0, fundSpendAmount: 0 };
    }
    return { ok: true, tx, effectiveLinkedFundId: linkedFundId, topupAmount: 0, fundSpendAmount };
  }
  if (choice === "unlink") {
    const next = { ...tx };
    delete next.linkedFundId;
    return { ok: true, tx: next, effectiveLinkedFundId: "", topupAmount: 0, fundSpendAmount: 0 };
  }
  return failure("unknown_fund_choice", "無法識別大額準備處理方式");
}

export function applyMainTransaction(draft, { tx, editingTx, effectiveLinkedFundId, topupAmount, fundSpendAmount }, createFundEventId) {
  if (editingTx) {
    draft.txs = draft.txs.map((item) => (sameTransactionId(item.id, editingTx.id) ? tx : item));
    draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, editingTx.id);
  } else {
    draft.txs.unshift(tx);
  }
  if (tx.type !== "expense" || !effectiveLinkedFundId || fundSpendAmount <= 0) return;
  const targetFund = draft.sinkingFunds.find((item) => sameTransactionId(item.id, effectiveLinkedFundId));
  if (!targetFund) return;
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

function accountExists(state, accountId) {
  return state.accounts.some((item) => sameTransactionId(item.id, accountId));
}

export function prepareDetailTransaction({ state, original, input }) {
  const nextType = String(input?.type || original.type);
  const normalizedAmount = toMoneyInt(input?.amount);
  const nextDate = String(input?.date || "");
  if (normalizedAmount <= 0) return failure("invalid_amount", "金額必須大於 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return failure("invalid_date", "日期格式不正確");

  if (original.type === "advance_repayment") {
    if (nextType !== "advance_repayment") return failure("repayment_type_change", "代墊收款不能改成其他交易類型");
    const advance = state.txs.find((item) => item.type === "advance" && sameTransactionId(item.id, original.advanceId));
    if (!advance) return failure("missing_advance", "找不到這筆收款對應的代墊");
    const keepsDeletedAccount = sameTransactionId(input?.accountId, original.acc);
    if (!accountExists(state, input?.accountId) && !keepsDeletedAccount) return failure("invalid_account", "請選擇有效帳戶");
    const maxAmount = Math.max(0, (advance.receivableAmount || 0) - getAdvanceRepaidAmount(state.txs, advance.id, original.id));
    if (normalizedAmount > maxAmount) return failure("repayment_exceeds_receivable", `收回金額不能超過 ${maxAmount}`);
    return {
      ok: true,
      mode: "repayment",
      original,
      changes: { amount: normalizedAmount, date: nextDate, acc: input.accountId, desc: String(input?.desc || "").trim() },
    };
  }

  const allowedTypes = ["income", "expense", "transfer", "advance"];
  if (!allowedTypes.includes(nextType)) return failure("unsupported_type", "不支援這種交易類型");
  const repaidAmount = original.type === "advance" ? getAdvanceRepaidAmount(state.txs, original.id) : 0;
  if (original.type === "advance" && nextType !== "advance" && repaidAmount > 0) {
    return failure("advance_has_repayments", "這筆代墊已有收款紀錄，不能改成其他類型");
  }

  if (nextType === "transfer") {
    const keepsDeletedFrom = original.type === "transfer" && sameTransactionId(input?.fromAcc, original.fromAcc);
    const keepsDeletedTo = original.type === "transfer" && sameTransactionId(input?.toAcc, original.toAcc);
    if ((!accountExists(state, input?.fromAcc) && !keepsDeletedFrom) || (!accountExists(state, input?.toAcc) && !keepsDeletedTo)) {
      return failure("invalid_transfer_accounts", "請選擇有效的轉出與轉入帳戶");
    }
    if (sameTransactionId(input.fromAcc, input.toAcc)) return failure("same_transfer_account", "轉出與轉入帳戶不能相同");
  } else {
    const keepsDeletedAccount = original.type === nextType && sameTransactionId(input?.accountId, original.acc);
    if (!accountExists(state, input?.accountId) && !keepsDeletedAccount) return failure("invalid_account", "請選擇有效帳戶");
  }

  const normalizedOwnAmount = toMoneyInt(input?.ownAmount);
  if (nextType === "advance") {
    if (!String(input?.person || "").trim()) return failure("missing_advance_person", "代墊對象不能空白");
    if (normalizedOwnAmount < 0 || normalizedOwnAmount >= normalizedAmount) {
      return failure("invalid_advance_own_amount", "自己負擔金額必須小於總金額");
    }
    if (normalizedAmount - normalizedOwnAmount < repaidAmount) {
      return failure("advance_below_repaid", `修改後應收款不能低於已收回的 ${repaidAmount}`);
    }
  }

  const next = buildTransaction({
    txType: nextType,
    amount: normalizedAmount,
    desc: input?.desc,
    date: nextDate,
    category: input?.category,
    subcategory: String(input?.subcategory || "").trim() || DEFAULT_SUBCATEGORY,
    accountId: input?.accountId,
    fromAcc: input?.fromAcc,
    toAcc: input?.toAcc,
    ownAmount: normalizedOwnAmount,
    person: input?.person || "",
    budgetMode: "normal",
    linkedFundId: "",
  });
  next.id = original.id;
  ["externalSource", "externalId", "externalUid", "externalTime"].forEach((key) => {
    if (original[key] !== undefined) next[key] = original[key];
  });
  if (original.type === "expense" && next.type === "expense" && original.budgetMode === "spread") {
    ["budgetMode", "spreadMonths", "spreadStartMonth", "spreadLabel"].forEach((key) => {
      if (original[key] !== undefined) next[key] = original[key];
    });
  }
  const keepsFundLink = original.type === "expense"
    && next.type === "expense"
    && original.linkedFundId
    && original.amount === next.amount
    && original.date === next.date;
  if (keepsFundLink) next.linkedFundId = original.linkedFundId;
  return { ok: true, mode: "transaction", original, next, keepsFundLink: Boolean(keepsFundLink) };
}

export function applyDetailTransaction(draft, command) {
  if (command.mode === "repayment") {
    const target = draft.txs.find((item) => sameTransactionId(item.id, command.original.id));
    if (target) Object.assign(target, command.changes);
    return;
  }
  draft.txs = draft.txs.map((item) => (sameTransactionId(item.id, command.original.id) ? command.next : item));
  if (command.keepsFundLink) {
    draft.sinkingFunds.forEach((item) => {
      (item.events || []).forEach((event) => {
        if (event.type === "spend" && sameTransactionId(event.linkedTxId, command.original.id)) {
          event.note = command.next.desc || command.next.cat;
        }
      });
    });
  } else {
    draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, command.original.id);
  }
}

export function applyDeleteTransaction(draft, target) {
  draft.txs = draft.txs.filter((tx) => !sameTransactionId(tx.id, target.id)
    && !(target.type === "advance" && tx.type === "advance_repayment" && sameTransactionId(tx.advanceId, target.id)));
  draft.sinkingFunds = withoutFundEventsLinkedToTransaction(draft.sinkingFunds, target.id);
}

export function prepareNewAdvanceRepayment({ state, advanceId, amount, accountId, date }) {
  const advance = getOpenAdvances(state.txs).find((tx) => sameTransactionId(tx.id, advanceId));
  if (!advance) return failure("missing_open_advance", "找不到這筆尚未收回的代墊");
  const repaymentAmount = toMoneyInt(amount);
  if (repaymentAmount <= 0 || repaymentAmount > getAdvanceOutstanding(state.txs, advance)) {
    return failure("invalid_repayment_amount", "收回金額不正確");
  }
  const account = state.accounts.find((item) => sameTransactionId(item.id, accountId));
  if (!account) return failure("invalid_account", "沒有選到有效帳戶");
  return {
    ok: true,
    advance,
    repayment: buildAdvanceRepayment({ advanceId: advance.id, amount: repaymentAmount, date, accountId: account.id, person: advance.person }),
  };
}

export function prepareAdvanceRepaymentEdit({ state, repaymentId, amount, date, accountId }) {
  const repayment = state.txs.find((tx) => sameTransactionId(tx.id, repaymentId) && tx.type === "advance_repayment");
  if (!repayment) return failure("missing_repayment", "找不到這筆代墊收款");
  const advance = state.txs.find((tx) => sameTransactionId(tx.id, repayment.advanceId) && tx.type === "advance");
  if (!advance) return failure("missing_advance", "找不到這筆收款對應的代墊");
  const maxAmount = Math.max(0, (advance.receivableAmount || 0) - getAdvanceRepaidAmount(state.txs, advance.id, repayment.id));
  const repaymentAmount = toMoneyInt(amount);
  if (repaymentAmount <= 0 || repaymentAmount > maxAmount) return failure("invalid_repayment_amount", "收回金額不正確");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return failure("invalid_date", "日期格式不正確");
  const account = state.accounts.find((item) => sameTransactionId(item.id, accountId));
  if (!account) return failure("invalid_account", "沒有選到有效帳戶");
  return { ok: true, repayment, advance, maxAmount, changes: { amount: repaymentAmount, date, acc: account.id } };
}
