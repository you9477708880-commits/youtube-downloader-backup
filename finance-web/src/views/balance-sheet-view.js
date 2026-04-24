import { calculateBalanceSheet } from "../domain/accounts.js";
import { getTransactionAccountIds, renderTransactionDetailList } from "./transaction-detail-view.js";

export function renderBalanceSheet({ state, utils, dom }) {
  const data = calculateBalanceSheet(state);
  const getAccountName = (id) => state.accounts.find((account) => account.id === id)?.name || "未知帳戶";
  const getAccountTxs = (accountId) => state.txs.filter((tx) => getTransactionAccountIds(tx).includes(accountId));

  const accountRows = state.accounts
    .map((account) => {
      const txs = getAccountTxs(account.id);
      return `
        <details class="drill">
          <summary>
            <div class="sr">
              <span class="flex-row gap-2">
                <button type="button" class="icon-btn ${account.isEm ? "text-pur" : "text-gray"}" data-action="toggle-em" data-id="${account.id}" data-isacc="true">${account.isEm ? "緊急" : '<span class="opacity-30">緊急</span>'}</button>
                ${utils.escapeHTML(account.name)}
              </span>
              <span class="flex-row gap-2 font-mono ${data.balances[account.id] < 0 ? "text-exp" : ""}">
                ${utils.formatMoney(data.balances[account.id])}
                <button type="button" class="del-btn text-lg p-1" data-action="del-bs" data-id="${account.id}" data-isacc="true">×</button>
              </span>
            </div>
          </summary>
          ${renderTransactionDetailList({ txs, utils, getAccountName, accountId: account.id })}
        </details>
      `;
    })
    .join("");

  const buildRows = (items) =>
    items
      .map((item) => `
        <div class="sr">
          <span class="flex-row gap-2">
            <button type="button" class="icon-btn ${item.isEm ? "text-pur" : "text-gray"}" data-action="toggle-em" data-id="${item.id}" data-isacc="false">${item.isEm ? "緊急" : '<span class="opacity-30">緊急</span>'}</button>
            ${utils.escapeHTML(item.name)}
          </span>
          <span class="flex-row gap-2 font-mono">
            ${utils.formatMoney(item.amount)}
            <button type="button" class="del-btn text-lg p-1" data-action="del-bs" data-id="${item.id}" data-isacc="false">×</button>
          </span>
        </div>
      `)
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
}
