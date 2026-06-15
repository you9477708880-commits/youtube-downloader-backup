import { calculateMonthlyReviewData } from "../domain/monthly-review.js";

function renderMetric({ label, value, utils, tone = "" }) {
  return `
    <div class="mc">
      <div class="lb">${utils.escapeHTML(label)}</div>
      <div class="vl ${tone}">${utils.formatMoney(value)}</div>
    </div>
  `;
}

function renderTextItems(items, utils) {
  return items.map((item) => `<li>${utils.escapeHTML(item)}</li>`).join("");
}

function renderBudgetUseItems(items, utils) {
  if (!items.length) return '<div class="empty detail-empty">本期沒有預算使用來源。</div>';
  return items
    .map(
      (item) => `
        <div class="detail-row">
          <div class="detail-main">
            <div class="detail-title">${utils.escapeHTML(item.title || item.typeLabel)}</div>
            <div class="detail-sub">${utils.escapeHTML(item.typeLabel)} ｜ ${utils.escapeHTML(item.date || "")}${item.subtitle ? ` ｜ ${utils.escapeHTML(item.subtitle)}` : ""}</div>
          </div>
          <div class="detail-amt">${utils.formatMoney(item.amount)}</div>
        </div>
      `,
    )
    .join("");
}

export function renderMonthlyReview({ state, filterRange, utils, dom }) {
  if (!dom.monthlyReview) return;

  const review = calculateMonthlyReviewData(state, filterRange);
  const period = review.range.start && review.range.end ? `${review.range.start} ~ ${review.range.end}` : "目前篩選範圍";
  const budgetTone = review.budget.budgetShortfall > 0 ? "text-exp" : "text-inc";
  const netTone = review.ledgerNet >= 0 ? "text-inc" : "text-exp";
  const worthTone = review.balanceSheet.netWorth >= 0 ? "text-inc" : "text-exp";

  dom.monthlyReview.innerHTML = `
    <div class="text-xs text-gray mb-2">${utils.escapeHTML(period)} ｜ ${review.txCount} 筆交易</div>
    <div class="grid-2 mb-2">
      ${renderMetric({ label: "本月收入", value: review.income, utils, tone: "text-inc" })}
      ${renderMetric({ label: "生活支出", value: review.budget.livingExpense, utils, tone: "text-exp" })}
      ${renderMetric({ label: "準備提撥 / 補入", value: review.budget.fundContribution + review.budget.manualTopups, utils })}
      ${renderMetric({ label: "動用準備", value: review.funds.spend, utils })}
      ${renderMetric({ label: "可自由運用", value: review.budget.freeToUse, utils, tone: budgetTone })}
      ${renderMetric({ label: "帳本淨額", value: review.ledgerNet, utils, tone: netTone })}
      ${renderMetric({ label: "目前淨值", value: review.balanceSheet.netWorth, utils, tone: worthTone })}
      ${renderMetric({ label: "應收代墊", value: review.balanceSheet.receivableTotal, utils })}
    </div>
    <div class="detail-list">
      <div class="detail-row">
        <div class="detail-main">
          <div class="detail-title">本月檢查提示</div>
          <ul class="detail-sub mt-1">${renderTextItems(review.prompts, utils)}</ul>
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-main">
          <div class="detail-title">主要預算使用來源</div>
          <div class="detail-sub mt-1">依金額列出前 5 筆，資料沿用預算頁來源明細。</div>
        </div>
      </div>
      ${renderBudgetUseItems(review.budgetUseItems, utils)}
      <div class="detail-row">
        <div class="detail-main">
          <div class="detail-title">資料來源</div>
          <ul class="detail-sub mt-1">${renderTextItems(review.sourceNotes, utils)}</ul>
        </div>
      </div>
    </div>
  `;
}
