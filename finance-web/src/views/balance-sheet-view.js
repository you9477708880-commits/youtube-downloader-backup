import { calculateBalanceSheet } from "../domain/accounts.js";
import { calculateAccountCenter } from "../domain/account-center.js";
import { getTransactionAccountIds, renderTransactionDetailList } from "./transaction-detail-view.js";

export function renderBalanceSheet({ state, utils, dom }) {
  const data = calculateBalanceSheet(state);
  const accountCenter = calculateAccountCenter(state);
  const getAccountName = (id) => state.accounts.find((account) => account.id === id)?.name || "未知帳戶";
  const getAccountTxs = (accountId) => state.txs.filter((tx) => getTransactionAccountIds(tx).includes(accountId));
  const emergencyIcon = (enabled) => (enabled ? "🛡️" : '<span class="opacity-30">🛡️</span>');

  const accountRows = state.accounts
    .map((account) => {
      const accountId = utils.escapeHTML(account.id);
      return `
        <div class="sr">
          <span>${utils.escapeHTML(account.name)}</span>
          <span class="font-mono ${data.balances[account.id] < 0 ? "text-exp" : ""}">${utils.formatMoney(data.balances[account.id])}</span>
        </div>
      `;
    })
    .join("");

  const buildRows = (items) =>
    items
      .map((item) => {
        const itemId = utils.escapeHTML(item.id);
        return `
        <div class="sr">
          <span class="flex-row gap-2">
            <button type="button" class="icon-btn ${item.isEm ? "text-blue" : "text-gray"}" title="${item.isEm ? "已設為緊急備用金" : "設為緊急備用金"}" data-action="toggle-em" data-id="${itemId}" data-isacc="false">${emergencyIcon(item.isEm)}</button>
            ${utils.escapeHTML(item.name)}
          </span>
          <span class="flex-row gap-2 font-mono">
            ${utils.formatMoney(item.amount)}
            <button type="button" class="sbtn outline compact" data-action="edit-bs" data-id="${itemId}" data-isacc="false">編輯</button>
            <button type="button" class="del-btn text-lg p-1" data-action="del-bs" data-id="${itemId}" data-isacc="false">×</button>
          </span>
        </div>
      `;
      })
      .join("");

  const receivableRows = data.receivables
    .map((item) => `
      <div class="sr">
        <span>
          代墊應收 - ${utils.escapeHTML(item.person || "未指定")}
          <span class="text-xs text-gray d-inline-flex w-100">${utils.escapeHTML(item.desc || item.cat || "")}</span>
        </span>
        <span class="font-mono text-inc">${utils.formatMoney(item.outstandingAmount)}</span>
      </div>
    `)
    .join("");

  dom.balanceSheetBody.innerHTML = `
    <div class="sdiv">帳戶</div>${state.accounts.length ? accountRows : '<div class="empty">尚無帳戶</div>'}
    <div class="sdiv">其他資產</div>${data.assets.length ? buildRows(data.assets) : '<div class="empty">尚無其他資產</div>'}
    <div class="sdiv">代墊應收款</div>${data.receivables.length ? receivableRows : '<div class="empty">目前沒有未收回的代墊款</div>'}
    <div class="sr st"><span>總資產</span><span class="text-inc font-mono">${utils.formatMoney(data.totalAssets)}</span></div>
    <div class="sdiv">負債</div>${data.liabilities.length ? buildRows(data.liabilities) : '<div class="empty">尚無負債</div>'}
    <div class="sr st"><span>總負債</span><span class="text-exp font-mono">${utils.formatMoney(data.totalLiabilities)}</span></div>
    <div class="divider-top"><div class="sr st" style="font-size:15px"><span>淨值</span><span class="${data.netWorth >= 0 ? "text-inc" : "text-exp"} font-mono">${utils.formatMoney(data.netWorth)}</span></div></div>
  `;

  dom.accountCenter.innerHTML = accountCenter.accounts.length
    ? accountCenter.accounts.map((account) => {
      const accountId = utils.escapeHTML(account.id);
      const isCard = account.type === "liability";
      const schedule = account.schedule;
      const metrics = isCard
        ? `
          <div class="account-metrics">
            <div><span>目前欠款</span><strong class="text-exp">${utils.formatMoney(account.debt)}</strong></div>
            <div><span>可用額度</span><strong>${account.creditLimit ? utils.formatMoney(account.availableCredit) : "未設定"}</strong></div>
            <div><span>本期新增刷卡</span><strong>${schedule ? utils.formatMoney(account.periodCharges) : "設定結帳日後顯示"}</strong></div>
            <div><span>本期信用卡繳款</span><strong>${schedule ? utils.formatMoney(account.periodPayments) : "設定結帳日後顯示"}</strong></div>
          </div>
          <div class="account-cycle-note">${schedule
            ? `本期 ${utils.escapeHTML(schedule.periodStart)} 起｜下次結帳 ${utils.escapeHTML(schedule.nextStatementDate)}${schedule.nextPaymentDueDate ? `｜下次繳款日 ${utils.escapeHTML(schedule.nextPaymentDueDate)}` : ""}`
            : "尚未設定結帳日；仍可正常記錄信用卡支出與繳款。"}</div>
        `
        : `<div class="account-metrics"><div><span>目前餘額</span><strong class="${account.balance >= 0 ? "text-inc" : "text-exp"}">${utils.formatMoney(account.balance)}</strong></div><div><span>本月流入</span><strong class="text-inc">${utils.formatMoney(account.monthInflow)}</strong></div><div><span>本月流出</span><strong class="text-exp">${utils.formatMoney(account.monthOutflow)}</strong></div><div><span>相關紀錄</span><strong>${account.transactionCount} 筆</strong></div></div>`;

      return `
        <details class="account-card">
          <summary>
            <span><strong>${utils.escapeHTML(account.name)}</strong><span class="bdg ${isCard ? "bdg-r" : "bdg-g"}">${isCard ? "負債／信用卡" : "資產帳戶"}</span></span>
            <span class="font-mono ${account.balance < 0 ? "text-exp" : "text-inc"}">${utils.formatMoney(account.balance)}</span>
          </summary>
          ${metrics}
          <div class="account-card-actions">
            <button type="button" class="sbtn outline compact" data-action="toggle-em" data-id="${accountId}" data-isacc="true">${account.isEm ? "取消緊急備用" : "設為緊急備用"}</button>
            <button type="button" class="sbtn outline compact" data-action="edit-bs" data-id="${accountId}" data-isacc="true">編輯帳戶</button>
            <button type="button" class="del-btn text-lg p-1" aria-label="刪除帳戶" data-action="del-bs" data-id="${accountId}" data-isacc="true">×</button>
          </div>
          <div class="account-reconcile">
            <label class="flb">對帳實際餘額${isCard ? "（欠款請輸入負數）" : ""}</label>
            <div class="account-reconcile-row">
              <input type="number" step="1" data-reconcile-input="${accountId}" placeholder="金融機構顯示的餘額">
              <button type="button" class="sbtn outline compact" data-action="reconcile-account" data-id="${accountId}">比對並建立調整</button>
            </div>
            <div class="text-xs text-gray mt-1">只有你確認後才建立調整；調整不列入收入、支出或預算，刪除該紀錄即可撤銷。</div>
          </div>
          <details class="account-transactions"><summary>查看相關交易（${account.transactionCount}）</summary>${renderTransactionDetailList({ txs: getAccountTxs(account.id), utils, getAccountName, accountId: account.id })}</details>
        </details>
      `;
    }).join("")
    : '<div class="empty">尚無帳戶；可先在左側新增現金、銀行或信用卡。</div>';
}
