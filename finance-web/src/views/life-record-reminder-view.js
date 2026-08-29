import { renderTransactionDetailList } from "./transaction-detail-view.js";

const STATUS_LABELS = {
  not_due: "尚未到期",
  due_soon: "接近提醒",
  overdue: "可能已超過",
};

export function renderLifeRecordReminder({ model, accounts = [], elements, utils }) {
  const accountNames = new Map(accounts.map((account) => [String(account.id), account.name || ""]));
  const getAccountName = (id) => accountNames.get(String(id || "")) || "未知帳戶";
  elements.status.dataset.state = model.status;
  elements.summary.hidden = true;
  elements.results.hidden = true;
  elements.summary.textContent = "";
  elements.results.innerHTML = "";

  if (model.status === "idle") {
    elements.status.textContent = "輸入關鍵字與預期間隔後，會比對截至今天的全部帳務紀錄。";
    return;
  }
  if (model.status === "invalid_interval") {
    elements.status.textContent = "請輸入 1～3650 的完整天數，例如 180。";
    return;
  }
  if (model.status === "no_matches") {
    elements.status.textContent = "全部歷史紀錄中沒有符合的內容。";
    return;
  }

  const timing = model.status === "overdue"
    ? `已超過自行設定的日期 ${Math.abs(model.daysUntilNext)} 天`
    : model.daysUntilNext === 0
      ? "自行設定的日期就是今天"
      : `距自行設定的日期 ${model.daysUntilNext} 天`;
  const parts = [
    `${STATUS_LABELS[model.status]}｜${timing}`,
    `${model.transactionCount} 筆交易／${model.occurrenceCount} 個不同日期`,
    `最近一次：${model.latestDate}（距今 ${model.daysSinceLatest} 天）`,
  ];
  if (model.averageIntervalDays !== null) parts.push(`歷次平均相隔 ${model.averageIntervalDays} 天`);
  parts.push(`依 ${model.expectedIntervalDays} 天試算下次：${model.nextExpectedDate}`);
  elements.status.textContent = parts.shift();
  elements.summary.textContent = parts.join("｜");
  elements.summary.hidden = false;
  elements.results.innerHTML = `
    <div class="life-reminder-results-title">最近 ${model.recentTransactions.length} 筆符合紀錄</div>
    ${renderTransactionDetailList({ txs: model.recentTransactions, utils, getAccountName })}
  `;
  elements.results.hidden = false;
}
