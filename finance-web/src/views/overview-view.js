import { summarizeOverview, summarizeExpenseCategories } from "../domain/transactions.js";

export function renderOverview({ state, filteredTxs, constants, utils, dom }) {
  const { income, expense, net } = summarizeOverview(filteredTxs);

  dom.oIncome.textContent = utils.formatMoney(income);
  dom.oExpense.textContent = utils.formatMoney(expense);
  dom.oNet.textContent = utils.formatMoney(net);
  dom.oNet.className = `vl ${net >= 0 ? "text-inc" : "text-exp"}`;

  const expenseCategories = summarizeExpenseCategories(filteredTxs);
  dom.oBars.innerHTML = expenseCategories.length
    ? expenseCategories
        .map(([category, value], index) => `
          <div class="br">
            <div class="bl" title="${utils.escapeHTML(category)}">${utils.escapeHTML(category)}</div>
            <div class="bt">
              <div class="bf" style="width:${((value / expenseCategories[0][1]) * 100).toFixed(1)}%;background:${constants.expenseColors[index % constants.expenseColors.length]}"></div>
            </div>
            <div class="bv">${utils.formatMoney(value)}</div>
          </div>
        `)
        .join("")
    : '<div class="empty">尚無支出資料</div>';
}
