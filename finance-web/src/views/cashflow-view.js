import { summarizeCashFlow } from "../domain/transactions.js";

export function renderCashFlow({ filteredTxs, utils, dom }) {
  const data = summarizeCashFlow(filteredTxs);
  dom.cashflowBody.innerHTML = `
    <div class="sdiv">一、營業活動</div>
    <div class="sr"><span>薪資 / 獎金 / 副業 / 其他</span><span class="text-inc">${utils.formatMoney(data.operatingIncome)}</span></div>
    <div class="sr"><span>日常生活支出</span><span class="text-exp">-${utils.formatMoney(data.operatingExpense)}</span></div>
    <div class="sr st"><span>營業活動淨現金流</span><span class="${data.netOperating >= 0 ? "text-inc" : "text-exp"}">${utils.formatMoney(data.netOperating)}</span></div>
    <div class="sdiv">二、投資活動</div>
    <div class="sr"><span>投資收益 / 租金收入</span><span class="text-inc">${utils.formatMoney(data.investingIncome)}</span></div>
    <div class="sr st"><span>投資活動淨現金流</span><span class="text-inc">${utils.formatMoney(data.investingIncome)}</span></div>
    <div class="divider-top">
      <div class="sr st" style="font-size:15px"><span>期末現金淨變動</span><span class="${data.netTotal >= 0 ? "text-inc" : "text-exp"}">${data.netTotal >= 0 ? "+" : ""}${utils.formatMoney(data.netTotal)}</span></div>
    </div>
  `;
}
