import { getLinkedFundSpendAmount } from "../domain/sinking-funds.js";
import { formatTransactionCategory, getAdvanceOutstanding, getOpenAdvances, groupTransactionsByDate, isBudgetSpreadTx } from "../domain/transactions.js";

export function renderLedger({ state, filteredTxs, constants, utils, dom }) {
  const accountOptions = state.accounts
    .map((account) => `<option value="${utils.escapeHTML(account.id)}">${utils.escapeHTML(account.name)}${account.isEm ? " 🛡️緊急備用" : ""}</option>`)
    .join("");

  document.querySelectorAll(".acc-opts").forEach((node) => {
    node.innerHTML = accountOptions;
  });

  const findAccountName = (id) => state.accounts.find((account) => account.id === id)?.name || "未知帳戶";
  const findFund = (id) => state.sinkingFunds?.find((fund) => fund.id === id);
  const findFundName = (id) => state.sinkingFunds?.find((fund) => fund.id === id)?.name || "";

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
        const txId = utils.escapeHTML(tx.id);
        const transfer = tx.type === "transfer";
        const advance = tx.type === "advance";
        const repayment = tx.type === "advance_repayment";
        const amount = formatTxAmount(tx);
        const background = tx.type === "income" || repayment ? "bg-inc-light" : tx.type === "expense" || advance ? "bg-exp-light" : "bg-trn-light";
        const accountLabel = transfer ? `${findAccountName(tx.fromAcc)} → ${findAccountName(tx.toAcc)}` : findAccountName(tx.acc);
        const categoryLabel = formatTransactionCategory(tx);
        const title = repayment ? "代墊收款" : advance ? `代墊｜${categoryLabel}` : transfer ? "轉帳" : categoryLabel;
        const linkedFund = tx.linkedFundId ? findFund(tx.linkedFundId) : null;
        const linkedFundName = tx.linkedFundId ? findFundName(tx.linkedFundId) : "";
        const linkedFundSpend = linkedFund ? Math.min(tx.amount || 0, getLinkedFundSpendAmount(linkedFund, tx.id)) : 0;
        const currentMonthExpense = tx.type === "expense" && linkedFundName ? Math.max(0, (tx.amount || 0) - linkedFundSpend) : 0;
        const fundTrace = linkedFundName
          ? `對應準備：${utils.escapeHTML(linkedFundName)} ｜ 準備支付 ${utils.formatMoney(linkedFundSpend)} ｜ ${
              currentMonthExpense > 0 ? `本月支出 ${utils.formatMoney(currentMonthExpense)}` : "本月不另外扣款"
            }`
          : "";
        const sub = advance
          ? `${utils.escapeHTML(tx.person || "對方")} ｜ 應收 ${utils.formatMoney(tx.receivableAmount || 0)} ｜ 自付 ${utils.formatMoney(tx.ownAmount || 0)}`
          : isBudgetSpreadTx(tx)
            ? `${tx.desc ? `${utils.escapeHTML(tx.desc)} ｜ ` : ""}分攤 ${tx.spreadMonths} 個月${tx.spreadLabel ? `｜${utils.escapeHTML(tx.spreadLabel)}` : ""}`
            : tx.desc
              ? `${utils.escapeHTML(tx.desc)}${fundTrace ? ` ｜ ${fundTrace}` : ""}`
              : fundTrace
                ? fundTrace
                : transfer
                  ? "帳戶轉移"
                  : "無備註";
        const icon = repayment ? "💸" : advance ? "🤝" : constants.transactionIcons[tx.cat] || "🧾";

        html += `
          <div class="tx-row">
            <div class="tx-ico ${background}">${icon}</div>
            <div class="tx-main">
              <div class="tx-title">${utils.escapeHTML(title)}</div>
              <div class="tx-sub">${sub}</div>
              ${linkedFundName ? `<button type="button" class="sbtn outline compact mt-1" data-action="open-fund" data-id="${utils.escapeHTML(tx.linkedFundId)}">查看對應準備</button>` : ""}
            </div>
            <div class="tx-meta">
              <div class="flex-col align-end gap-1">
                <div class="tx-amt ${amount.color}">${amount.sign}${utils.formatMoney(amount.value)}</div>
                <div class="tx-acc">${utils.escapeHTML(accountLabel)}</div>
                ${advance && getAdvanceOutstanding(state.txs, tx) > 0 ? `<button type="button" class="sbtn outline compact" data-action="repay-advance" data-id="${txId}">登記收款</button>` : ""}
              </div>
              ${
                showDelete
                  ? `
                    <div class="flex-row gap-1">
                      ${["income", "expense", "transfer", "advance"].includes(tx.type) ? `<button type="button" class="sbtn outline compact" data-action="edit-tx" data-id="${txId}">編輯</button>` : ""}
                      ${repayment ? `<button type="button" class="sbtn outline compact" data-action="edit-repayment" data-id="${txId}">編輯</button>` : ""}
                      <button type="button" class="del-btn text-lg p-1" aria-label="刪除" data-action="del-tx" data-id="${txId}">×</button>
                    </div>
                  `
                  : ""
              }
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
              <span class="font-bold">${utils.escapeHTML(tx.person || "對方")}</span>
              <span class="text-xs text-gray d-inline-flex w-100">${utils.escapeHTML(tx.desc || tx.cat)} ｜ 已收 ${utils.formatMoney(tx.repaidAmount || 0)}</span>
            </span>
            <span class="flex-row gap-2">
              <span class="font-mono text-inc">${utils.formatMoney(tx.outstandingAmount)}</span>
              <button type="button" class="sbtn outline compact" data-action="repay-advance" data-id="${utils.escapeHTML(tx.id)}">登記收款</button>
            </span>
          </div>
        `)
        .join("")
    : '<div class="empty">目前沒有尚未收回的代墊。</div>';

  dom.oTx.innerHTML = buildHtml(filteredTxs.slice(0, 10), false) || '<div class="empty">本期沒有交易。</div>';
  dom.aTx.innerHTML = buildHtml(filteredTxs, true) || '<div class="empty">目前還沒有任何交易。</div>';
  dom.txCount.textContent = `${filteredTxs.length} 筆`;
}
