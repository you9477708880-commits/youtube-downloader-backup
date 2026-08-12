export function renderTransactionSearch({ model, elements }) {
  const active = !!model.query;
  elements.summary.hidden = !active || model.matchCount === 0;
  elements.empty.hidden = !active || model.matchCount !== 0;
  elements.clear.disabled = !active;
  elements.customRange.hidden = elements.preset.value !== "custom";

  if (!active) {
    elements.status.textContent = "輸入關鍵字後，可從備註、分類、帳戶、代墊對象與準備金名稱搜尋。";
    elements.summary.textContent = "";
    return;
  }

  elements.status.textContent = `搜尋期間：${model.range.start || "最早紀錄"} ～ ${model.range.end || "今天"}`;
  if (!model.matchCount) {
    elements.summary.textContent = "";
    elements.empty.textContent = "這個期間沒有符合的記帳紀錄。";
    return;
  }

  const parts = [`最近一次：${model.latestDate}`];
  if (model.daysSinceLatest !== null) parts.push(`距今 ${model.daysSinceLatest} 天`);
  if (model.latestIntervalDays !== null) parts.push(`最近兩次相隔 ${model.latestIntervalDays} 天`);
  elements.summary.textContent = parts.join("｜");
}
