import { getPersonalExpenseAmount, getTransactionCategory, summarizeCashFlow } from "../domain/transactions.js";
import { renderTransactionDetailList } from "./transaction-detail-view.js";

const INVESTING_INCOME_CATEGORIES = ["投資收益", "股息收入"];

export function renderCashFlow({ filteredTxs, utils, dom, state }) {
  const data = summarizeCashFlow(filteredTxs);
  const getAccountName = (id) => state.accounts.find((account) => account.id === id)?.name || "未知帳戶";

  const operatingIncomeTxs = filteredTxs.filter((tx) => tx.type === "income" && !INVESTING_INCOME_CATEGORIES.includes(getTransactionCategory(tx)));
  const operatingExpenseTxs = filteredTxs.filter((tx) => getPersonalExpenseAmount(tx) > 0);
  const investingIncomeTxs = filteredTxs.filter((tx) => tx.type === "income" && INVESTING_INCOME_CATEGORIES.includes(getTransactionCategory(tx)));

  const drillRow = ({ label, amount, txs, color = "text-inc", prefix = "" }) => `
    <details class="drill">
      <summary>
        <div class="sr">
          <span>${label}</span>
          <span class="${color}">${prefix}${utils.formatMoney(amount)}</span>
        </div>
      </summary>
      ${renderTransactionDetailList({ txs, utils, getAccountName })}
    </details>
  `;

  dom.cashflowBody.innerHTML = `
    <div class="sdiv">營運現金流</div>
    ${drillRow({
      label: "營運與自訂收入",
      amount: data.operatingIncome,
      txs: operatingIncomeTxs,
      color: "text-inc",
    })}
    ${drillRow({
      label: "生活與日常支出",
      amount: data.operatingExpense,
      txs: operatingExpenseTxs,
      color: "text-exp",
      prefix: "-",
    })}
    <div class="sr st"><span>營運現金流淨額</span><span class="${data.netOperating >= 0 ? "text-inc" : "text-exp"}">${utils.formatMoney(data.netOperating)}</span></div>
    <div class="sdiv">投資現金流</div>
    ${drillRow({
      label: "投資收益 / 股息收入",
      amount: data.investingIncome,
      txs: investingIncomeTxs,
      color: "text-inc",
    })}
    <div class="sr st"><span>投資現金流淨額</span><span class="text-inc">${utils.formatMoney(data.investingIncome)}</span></div>
    <div class="divider-top">
      <div class="sr st" style="font-size:15px"><span>總現金流淨額</span><span class="${data.netTotal >= 0 ? "text-inc" : "text-exp"}">${data.netTotal >= 0 ? "+" : ""}${utils.formatMoney(data.netTotal)}</span></div>
    </div>
  `;
}
