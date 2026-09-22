import { DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { sameTransactionId } from "./transaction-commands.js";

// Repeating is a form prefill, not an accounting command or a record clone.
export function canRepeatTransaction(state, tx) {
  if (!tx || !["income", "expense"].includes(tx.type)) return false;
  if (tx.linkedFundId || tx.advanceId || tx.budgetMode === "spread") return false;
  if ((state.sinkingFunds || []).some((fund) => (fund.events || []).some((event) =>
    event.linkedTxId !== undefined && sameTransactionId(event.linkedTxId, tx.id)))) return false;
  return !(state.txs || []).some((item) => item.advanceId !== undefined && sameTransactionId(item.advanceId, tx.id));
}

export function prepareRepeatTransaction({ state, id, date }) {
  const original = state.txs.find((item) => sameTransactionId(item.id, id));
  if (!original) return { ok: false, message: "找不到這筆交易" };
  if (!canRepeatTransaction(state, original)) {
    return { ok: false, message: "再記一筆只支援沒有準備金、代墊或分攤關聯的一般收入／支出" };
  }
  const account = state.accounts.find((item) => sameTransactionId(item.id, original.acc) && item.enabled !== false);
  return {
    ok: true,
    input: {
      type: original.type,
      amount: original.amount,
      desc: original.desc || "",
      date,
      category: original.category || original.cat || DEFAULT_SUBCATEGORY,
      subcategory: original.subcategory || DEFAULT_SUBCATEGORY,
      accountId: account?.id ?? "",
    },
  };
}
