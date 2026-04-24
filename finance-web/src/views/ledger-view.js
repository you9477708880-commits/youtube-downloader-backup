import { getAdvanceOutstanding, getOpenAdvances, groupTransactionsByDate, isBudgetSpreadTx } from "../domain/transactions.js";

export function renderLedger({ state, filteredTxs, constants, utils, dom }) {
  const accountOptions = state.accounts
    .map((account) => `<option value="${account.id}">${utils.escapeHTML(account.name)}${account.isEm ? " 緊急" : ""}</option>`)
    .join("");

  document.querySelectorAll(".acc-opts").forEach((node) => {
    node.innerHTML = accountOptions;
  });

  const findAccountName = (id) => state.accounts.find((account) => account.id === id)?.name || "未知帳戶";
  const formatTxAmount = (tx) => {
    if (tx.type === "income") return { sign: "+", color: "text-inc", value: tx.amount };
    if (tx.type === "expense") return { sign: "-", color: "text-exp", value: tx.amount };
    if (tx.type === "advance") return { sign: "-", color: "text-exp", value: tx.amount };
    if (tx.type === "advance_repayment") return { sign: "+", color: "text-inc", value: tx.amount };
    return { sign: "", color: "text-trn", value: tx.amount };
  };

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
        const advance = tx.type === "advance";
        const repayment = tx.type === "advance_repayment";
        const amount = formatTxAmount(tx);
        const background = tx.type === "income" || repayment ? "bg-inc-light" : tx.type === "expense" || advance ? "bg-exp-light" : "bg-trn-light";
        const accountLabel = transfer ? `${findAccountName(tx.fromAcc)} → ${findAccountName(tx.toAcc)}` : findAccountName(tx.acc);
        const title = repayment ? "代墊收款" : advance ? `代墊：${tx.cat}` : transfer ? "轉帳" : tx.cat;
        const sub = advance
          ? `${utils.escapeHTML(tx.person || "未指定")} 應還 ${utils.formatMoney(tx.receivableAmount || 0)}，自己負擔 ${utils.formatMoney(tx.ownAmount || 0)}`
          : isBudgetSpreadTx(tx)
            ? `${tx.desc ? `${utils.escapeHTML(tx.desc)}｜` : ""}預算分攤 ${tx.spreadMonths} 個月${tx.spreadLabel ? `｜${utils.escapeHTML(tx.spreadLabel)}` : ""}`
          : tx.desc
            ? utils.escapeHTML(tx.desc)
            : transfer
              ? "轉帳"
              : "一般交易";
        const icon = repayment ? "↩" : advance ? "代" : constants.transactionIcons[tx.cat] || "•";

        html += `
          <div class="tx-row">
            <div class="tx-ico ${background}">${icon}</div>
            <div class="tx-main">
              <div class="tx-title">${utils.escapeHTML(title)}</div>
              <div class="tx-sub">${sub}</div>
            </div>
            <div class="tx-meta">
              <div class="flex-col align-end gap-1">
                <div class="tx-amt ${amount.color}">${amount.sign}${utils.formatMoney(amount.value)}</div>
                <div class="tx-acc">${utils.escapeHTML(accountLabel)}</div>
                ${advance && getAdvanceOutstanding(state.txs, tx) > 0 ? `<button type="button" class="sbtn outline compact" data-action="repay-advance" data-id="${tx.id}">登記收款</button>` : ""}
              </div>
              ${showDelete ? `<button type="button" class="del-btn text-lg p-1" aria-label="刪除" data-action="del-tx" data-id="${tx.id}">×</button>` : ""}
            </div>
          </div>
        `;
      });
    }

    return html;
  };

  const openAdvances = getOpenAdvances(state.txs);
  dom.advList.innerHTML = openAdvances.length
    ? openAdvances
        .map((tx) => `
          <div class="sr">
            <span>
              <span class="font-bold">${utils.escapeHTML(tx.person || "未指定")}</span>
              <span class="text-xs text-gray d-inline-flex w-100">${utils.escapeHTML(tx.desc || tx.cat)}｜已還 ${utils.formatMoney(tx.repaidAmount || 0)}</span>
            </span>
            <span class="flex-row gap-2">
              <span class="font-mono text-inc">${utils.formatMoney(tx.outstandingAmount)}</span>
              <button type="button" class="sbtn outline compact" data-action="repay-advance" data-id="${tx.id}">登記收款</button>
            </span>
          </div>
        `)
        .join("")
    : '<div class="empty">目前沒有待收代墊款</div>';

  dom.oTx.innerHTML = buildHtml(filteredTxs.slice(0, 10), false) || '<div class="empty">本期間沒有交易</div>';
  dom.aTx.innerHTML = buildHtml(filteredTxs, true) || '<div class="empty">尚無交易記錄</div>';
  dom.txCount.textContent = `${filteredTxs.length} 筆`;
}
