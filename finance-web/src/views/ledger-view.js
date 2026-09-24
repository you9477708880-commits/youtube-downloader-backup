import { getLinkedFundSpendAmount } from "../domain/sinking-funds.js";
import { buildAdvanceRepaymentIndex, formatTransactionCategory, getOpenAdvances, groupTransactionsByDate, isBudgetSpreadTx } from "../domain/transactions.js";
import { DEFAULT_PAGE_SIZE, focusListPageControl, paginateList, renderListPagination } from "./list-pagination.js";

const ledgerViews = new WeakMap();

export function resetLedgerView(dom) {
  const view = ledgerViews.get(dom.aTx);
  if (view) dom.aTx.removeEventListener?.("click", view.handlePage);
  ledgerViews.delete(dom.aTx);
}

export function renderLedger({ state, filteredTxs, reportTxs = filteredTxs, constants, utils, dom, paginationKey = "", pageSize = DEFAULT_PAGE_SIZE, readModels }) {
  let view = ledgerViews.get(dom.aTx);
  if (!view) {
    view = { page: 0, paginationKey };
    view.handlePage = (event) => {
      const button = event.target.closest?.("[data-list-page]");
      if (!button || !dom.aTx.contains(button) || button.disabled) return;
      const direction = button.dataset.listPage;
      view.page += direction === "next" ? 1 : -1;
      view.renderPage();
      focusListPageControl(dom.aTx, direction);
    };
    dom.aTx.addEventListener?.("click", view.handlePage);
    ledgerViews.set(dom.aTx, view);
  }
  if (view.paginationKey !== paginationKey) view.page = 0;
  view.paginationKey = paginationKey;

  const accountNames = new Map();
  for (const account of state.accounts) {
    if (!accountNames.has(account.id)) accountNames.set(account.id, account.name);
  }
  const findAccountName = (id) => accountNames.get(id) || "未知帳戶";
  const findFund = (id) => state.sinkingFunds?.find((fund) => fund.id === id);
  const findFundName = (id) => state.sinkingFunds?.find((fund) => fund.id === id)?.name || "";

  const formatTxAmount = (tx) => {
    if (tx.type === "income") return { sign: "+", color: "text-inc", value: tx.amount };
    if (tx.type === "expense") return { sign: "-", color: "text-exp", value: tx.amount };
    if (tx.type === "advance") return { sign: "-", color: "text-exp", value: tx.amount };
    if (tx.type === "advance_repayment") return { sign: "+", color: "text-inc", value: tx.amount };
    if (tx.type === "balance_adjustment") return { sign: tx.direction === "increase" ? "+" : "-", color: tx.direction === "increase" ? "text-inc" : "text-exp", value: tx.amount };
    return { sign: "", color: "text-trn", value: tx.amount };
  };

  const repayments = buildAdvanceRepaymentIndex(state.txs);
  const openAdvances = readModels?.openAdvances ?? getOpenAdvances(state.txs, repayments);
  const hasOutstanding = (tx) => Math.max(0, (tx.receivableAmount || 0) - (repayments.has(String(tx.id)) ? repayments.get(String(tx.id)) : 0)) > 0;
  const allGroups = groupTransactionsByDate(filteredTxs);
  const sortedTransactions = [...allGroups.values()].flatMap((group) => group.txs);

  const buildHtml = (txList, showDelete, fullDateTotals = false) => {
    if (!txList.length) return "";

    const grouped = groupTransactionsByDate(txList);
    let html = "";

    for (const [date, group] of grouped) {
      const totals = fullDateTotals ? allGroups.get(date) : group;
      const dateObj = new Date(date);
      const dayString = Number.isNaN(dateObj.getTime()) ? "" : ` (${constants.days[dateObj.getDay()]})`;
      let summary = "";

      if (totals.inc > 0) summary += `<span class="text-inc">+${utils.formatMoney(totals.inc)}</span>`;
      if (totals.exp > 0) summary += `${summary ? " " : ""}<span class="text-exp">-${utils.formatMoney(totals.exp)}</span>`;

      html += `<div class="tx-date-hdr"><span>${date}${dayString}</span><span class="tx-date-sum">${summary}</span></div>`;

      group.txs.forEach((tx) => {
        const txId = utils.escapeHTML(tx.id);
        const transfer = tx.type === "transfer";
        const advance = tx.type === "advance";
        const repayment = tx.type === "advance_repayment";
        const adjustment = tx.type === "balance_adjustment";
        const amount = formatTxAmount(tx);
        const background = tx.type === "income" || repayment || (adjustment && tx.direction === "increase") ? "bg-inc-light" : tx.type === "expense" || advance || adjustment ? "bg-exp-light" : "bg-trn-light";
        const accountLabel = transfer ? `${findAccountName(tx.fromAcc)} → ${findAccountName(tx.toAcc)}` : findAccountName(tx.acc);
        const categoryLabel = formatTransactionCategory(tx);
        const title = adjustment ? "帳戶調整" : repayment ? "代墊收款" : advance ? `代墊｜${categoryLabel}` : transfer ? "轉帳" : categoryLabel;
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
        const icon = adjustment ? "⚖️" : repayment ? "💸" : advance ? "🤝" : constants.transactionIcons[tx.cat] || "🧾";

        html += `
          <div class="tx-row">
            <div class="tx-ico ${background}">${icon}</div>
            <button type="button" class="tx-main tx-open" data-action="view-tx" data-id="${txId}" aria-haspopup="dialog" aria-label="查看這筆交易的完整明細">
              <span class="tx-title">${utils.escapeHTML(title)}</span>
              <span class="tx-sub">${sub}</span>
            </button>
            <div class="tx-meta">
              <div class="flex-col align-end gap-1">
                <div class="tx-amt ${amount.color}">${amount.sign}${utils.formatMoney(amount.value)}</div>
                <div class="tx-acc">${utils.escapeHTML(accountLabel)}</div>
                ${advance && hasOutstanding(tx) ? `<button type="button" class="sbtn outline compact" data-action="repay-advance" data-id="${txId}">登記收款</button>` : ""}
              </div>
              ${
                showDelete
                  ? `
                    <div class="flex-row gap-1">
                      ${linkedFundName ? `<button type="button" class="sbtn outline compact" data-action="open-fund" data-id="${utils.escapeHTML(tx.linkedFundId)}">查看準備</button>` : ""}
                      ${["income", "expense", "transfer", "advance"].includes(tx.type) ? `<button type="button" class="sbtn outline compact" data-action="edit-tx" data-id="${txId}">編輯</button>` : ""}
                      ${repayment ? `<button type="button" class="sbtn outline compact" data-action="edit-repayment" data-id="${txId}">編輯</button>` : ""}
                      <button type="button" class="sbtn outline compact ledger-delete" aria-label="刪除這筆交易" data-action="del-tx" data-id="${txId}">刪除</button>
                    </div>
                  `
                  : linkedFundName
                    ? `<button type="button" class="sbtn outline compact" data-action="open-fund" data-id="${utils.escapeHTML(tx.linkedFundId)}">查看準備</button>`
                    : ""
              }
            </div>
          </div>
        `;
      });
    }

    return html;
  };

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

  dom.oTx.innerHTML = buildHtml(reportTxs.slice(0, 10), false) || '<div class="empty">本期沒有交易。</div>';
  view.renderPage = () => {
    const pagination = paginateList(sortedTransactions, view.page, pageSize);
    view.page = pagination.page;
    const note = pagination.pageCount > 1 ? '<div class="text-xs text-gray mb-2">日期小計包含當日所有符合紀錄；分頁不影響報表總額。</div>' : "";
    dom.aTx.innerHTML = renderListPagination(pagination) + note + (buildHtml(pagination.items, true, true) || '<div class="empty">目前還沒有任何交易。</div>');
  };
  view.renderPage();
  dom.txCount.textContent = `${filteredTxs.length} 筆`;
}
