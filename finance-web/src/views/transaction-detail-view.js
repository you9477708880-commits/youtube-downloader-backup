import { compareTransactionsByDateDesc, formatTransactionCategory, getPersonalExpenseAmount } from "../domain/transactions.js";

export function getTransactionAccountIds(tx) {
  if (tx.type === "transfer") return [tx.fromAcc, tx.toAcc].filter(Boolean);
  return tx.acc ? [tx.acc] : [];
}

export function getTransactionSignedAmount(tx, accountId = "") {
  if (accountId) {
    if (tx.type === "transfer") {
      if (tx.fromAcc === accountId) return -tx.amount;
      if (tx.toAcc === accountId) return tx.amount;
      return 0;
    }

    if (tx.acc !== accountId) return 0;
    if (tx.type === "income" || tx.type === "advance_repayment") return tx.amount;
    if (tx.type === "expense" || tx.type === "advance") return -tx.amount;
  }

  if (tx.type === "income" || tx.type === "advance_repayment") return tx.amount;
  if (tx.type === "expense") return -tx.amount;
  if (tx.type === "advance") return -getPersonalExpenseAmount(tx);
  return 0;
}

export function getTransactionTitle(tx) {
  if (tx.type === "income") return `收入：${formatTransactionCategory(tx)}`;
  if (tx.type === "expense") return `支出：${formatTransactionCategory(tx)}`;
  if (tx.type === "transfer") return "轉帳";
  if (tx.type === "advance") return `代墊：${formatTransactionCategory(tx)}`;
  if (tx.type === "advance_repayment") return "代墊收款";
  return tx.cat || "交易";
}

export function getTransactionSubtitle(tx, accountName = "") {
  const desc = tx.desc || "";
  if (tx.type === "advance") {
    return `${tx.person || "未指定"} 應還 ${tx.receivableAmount || 0}，自己負擔 ${tx.ownAmount || 0}${desc ? `｜${desc}` : ""}`;
  }
  if (tx.type === "advance_repayment") return `${tx.person || "未指定"} 還款${accountName ? `｜${accountName}` : ""}`;
  return desc || accountName || "";
}

export function renderTransactionDetailList({ txs, utils, getAccountName, accountId = "" }) {
  if (!txs.length) return '<div class="empty detail-empty">沒有相關明細</div>';

  const sorted = [...txs].sort(compareTransactionsByDateDesc);

  return `
    <div class="detail-list">
      ${sorted
        .map((tx) => {
          const signedAmount = getTransactionSignedAmount(tx, accountId);
          const accountLabel =
            tx.type === "transfer"
              ? `${getAccountName(tx.fromAcc)} → ${getAccountName(tx.toAcc)}`
              : getAccountName(tx.acc);
          const subtitle = getTransactionSubtitle(tx, accountLabel);
          return `
            <button type="button" class="detail-row detail-open" data-action="view-tx" data-id="${utils.escapeHTML(tx.id)}" aria-haspopup="dialog" aria-label="查看完整交易明細">
              <span class="detail-main">
                <span class="detail-title">${utils.escapeHTML(getTransactionTitle(tx))}</span>
                <span class="detail-sub">${utils.escapeHTML(tx.date || "")}${subtitle ? `｜${utils.escapeHTML(subtitle)}` : ""}</span>
              </span>
              <span class="detail-amt ${signedAmount >= 0 ? "text-inc" : "text-exp"}">
                ${signedAmount >= 0 ? "+" : "-"}${utils.formatMoney(Math.abs(signedAmount))}
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}
