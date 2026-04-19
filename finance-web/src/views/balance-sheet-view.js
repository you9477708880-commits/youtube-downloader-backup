import { calculateBalanceSheet } from "../domain/accounts.js";

export function renderBalanceSheet({ state, utils, dom }) {
  const data = calculateBalanceSheet(state);

  const accountRows = state.accounts
    .map((account) => `
      <div class="sr">
        <span class="flex-row gap-2">
          <button type="button" class="icon-btn ${account.isEm ? "text-pur" : "text-gray"}" data-action="toggle-em" data-id="${account.id}" data-isacc="true">${account.isEm ? "🛡️" : '<span class="opacity-30">🛡️</span>'}</button>
          ${utils.escapeHTML(account.name)}
        </span>
        <span class="flex-row gap-2 font-mono ${data.balances[account.id] < 0 ? "text-exp" : ""}">
          ${utils.formatMoney(data.balances[account.id])}
          <button type="button" class="del-btn text-lg p-1" data-action="del-bs" data-id="${account.id}" data-isacc="true">✕</button>
        </span>
      </div>
    `)
    .join("");

  const buildRows = (items) =>
    items
      .map((item) => `
        <div class="sr">
          <span class="flex-row gap-2">
            <button type="button" class="icon-btn ${item.isEm ? "text-pur" : "text-gray"}" data-action="toggle-em" data-id="${item.id}" data-isacc="false">${item.isEm ? "🛡️" : '<span class="opacity-30">🛡️</span>'}</button>
            ${utils.escapeHTML(item.name)}
          </span>
          <span class="flex-row gap-2 font-mono">
            ${utils.formatMoney(item.amount)}
            <button type="button" class="del-btn text-lg p-1" data-action="del-bs" data-id="${item.id}" data-isacc="false">✕</button>
          </span>
        </div>
      `)
      .join("");

  dom.balanceSheetBody.innerHTML = `
    <div class="sdiv">流動帳戶</div>${state.accounts.length ? accountRows : '<div class="empty">無帳戶資料</div>'}
    <div class="sdiv">其他固定資產</div>${data.assets.length ? buildRows(data.assets) : '<div class="empty">無資產項目</div>'}
    <div class="sr st"><span>總資產合計</span><span class="text-inc font-mono">${utils.formatMoney(data.totalAssets)}</span></div>
    <div class="sdiv">其他長期負債</div>${data.liabilities.length ? buildRows(data.liabilities) : '<div class="empty">無負債項目</div>'}
    <div class="sr st"><span>總負債合計</span><span class="text-exp font-mono">${utils.formatMoney(data.totalLiabilities)}</span></div>
    <div class="divider-top"><div class="sr st" style="font-size:15px"><span>淨資產（權益）</span><span class="${data.netWorth >= 0 ? "text-inc" : "text-exp"} font-mono">${utils.formatMoney(data.netWorth)}</span></div></div>
  `;
}
