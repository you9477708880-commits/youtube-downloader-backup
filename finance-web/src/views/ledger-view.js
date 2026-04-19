import { groupTransactionsByDate } from "../domain/transactions.js";

export function renderLedger({ state, filteredTxs, constants, utils, dom }) {
  const accountOptions = state.accounts
    .map((account) => `<option value="${account.id}">${utils.escapeHTML(account.name)}${account.isEm ? " 🛡️" : ""}</option>`)
    .join("");

  document.querySelectorAll(".acc-opts").forEach((node) => {
    node.innerHTML = accountOptions;
  });

  const findAccountName = (id) => state.accounts.find((account) => account.id === id)?.name || "未知";
  const groups = groupTransactionsByDate(filteredTxs);

  const buildHtml = (txList, showDelete) => {
    if (!txList.length) return "";

    const grouped = groupTransactionsByDate(txList);
    let html = "";

    for (const [date, group] of grouped) {
      const dateObj = new Date(date);
      const dayString = Number.isNaN(dateObj.getTime()) ? "" : ` (${constants.days[dateObj.getDay()]})`;
      let summary = "";

      if (group.inc > 0) summary += `<span class="text-inc">+${utils.formatMoney(group.inc)}</span>`;
      if (group.exp > 0) summary += `${summary ? " " : ""}<span class="text-exp">-${utils.formatMoney(group.exp)}</span>`;

      html += `<div class="tx-date-hdr"><span>${date}${dayString}</span><span class="tx-date-sum">${summary}</span></div>`;

      group.txs.forEach((tx) => {
        const transfer = tx.type === "transfer";
        const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
        const color = tx.type === "income" ? "text-inc" : tx.type === "expense" ? "text-exp" : "text-trn";
        const background = tx.type === "income" ? "bg-inc-light" : tx.type === "expense" ? "bg-exp-light" : "bg-trn-light";
        const accountLabel = transfer ? `${findAccountName(tx.fromAcc)} ➔ ${findAccountName(tx.toAcc)}` : findAccountName(tx.acc);
        const descLabel = tx.desc ? utils.escapeHTML(tx.desc) : transfer ? "轉帳" : "無備註";

        html += `
          <div class="tx-row">
            <div class="tx-ico ${background}">${constants.transactionIcons[tx.cat] || "✨"}</div>
            <div class="tx-main">
              <div class="tx-title">${utils.escapeHTML(tx.cat)}</div>
              <div class="tx-sub">${descLabel}</div>
            </div>
            <div class="tx-meta">
              <div class="flex-col align-end gap-1">
                <div class="tx-amt ${color}">${sign}${utils.formatMoney(tx.amount)}</div>
                <div class="tx-acc">${utils.escapeHTML(accountLabel)}</div>
              </div>
              ${showDelete ? `<button type="button" class="del-btn text-lg p-1" aria-label="刪除" data-action="del-tx" data-id="${tx.id}">✕</button>` : ""}
            </div>
          </div>
        `;
      });
    }

    return html;
  };

  dom.oTx.innerHTML = buildHtml(filteredTxs.slice(0, 10), false) || '<div class="empty">篩選期間無記錄</div>';
  dom.aTx.innerHTML = buildHtml(filteredTxs, true) || '<div class="empty">尚無交易記錄</div>';
  dom.txCount.textContent = `${filteredTxs.length} 筆`;
}
