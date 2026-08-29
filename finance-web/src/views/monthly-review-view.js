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
        <button type="button" class="detail-row detail-open" data-action="${item.type === "living-expense" ? "view-tx" : "view-budget-source"}" data-id="${utils.escapeHTML(item.id)}" data-source-type="${utils.escapeHTML(item.type)}" aria-haspopup="dialog" aria-label="查看完整明細">
          <span class="detail-main">
            <span class="detail-title">${utils.escapeHTML(item.title || item.typeLabel)}</span>
            <span class="detail-sub">${utils.escapeHTML(item.typeLabel)} ｜ ${utils.escapeHTML(item.date || "")}${item.subtitle ? ` ｜ ${utils.escapeHTML(item.subtitle)}` : ""}</span>
          </span>
          <span class="detail-amt">${utils.formatMoney(item.amount)}</span>
        </button>
      `,
    )
    .join("");
}

function renderDelta(delta, utils) {
  if (!delta) return "持平";
  return `${delta > 0 ? "增加" : "減少"} ${utils.formatMoney(Math.abs(delta))}`;
}

function renderComparison(review, utils) {
  const comparison = review.comparison;
  if (!comparison) return "";
  const rows = [
    ["收入", comparison.metrics.income],
    ["生活支出", comparison.metrics.livingExpense],
    ["準備提撥／補入", comparison.metrics.fundPreparation],
    ["動用準備", comparison.metrics.fundSpend],
  ];
  const category = comparison.largestCategoryChange;

  return `
    <details class="review-comparison">
      <summary>與上期比較 <span class="text-xs text-gray">${utils.escapeHTML(comparison.range.start)} ~ ${utils.escapeHTML(comparison.range.end)}｜${comparison.txCount} 筆</span></summary>
      <div class="detail-list mt-2">
        ${rows.map(([label, metric]) => `
          <div class="detail-row">
            <span class="detail-main"><span class="detail-title">${utils.escapeHTML(label)}</span><span class="detail-sub">本期 ${utils.formatMoney(metric.current)}｜上期 ${utils.formatMoney(metric.previous)}</span></span>
            <span class="detail-amt">${utils.escapeHTML(renderDelta(metric.delta, utils))}</span>
          </div>
        `).join("")}
        <div class="detail-row">
          <span class="detail-main"><span class="detail-title">支出分類變化</span><span class="detail-sub">${category
            ? `${utils.escapeHTML(category.category)}｜本期 ${utils.formatMoney(category.current)}｜上期 ${utils.formatMoney(category.previous)}`
            : "兩期生活支出分類沒有金額差異"}</span></span>
          ${category ? `<span class="detail-amt">${utils.escapeHTML(renderDelta(category.delta, utils))}</span>` : ""}
        </div>
      </div>
      <div class="text-xs text-gray mt-2">只比較相同天數的前一期間；金額增加或減少不代表好壞，請搭配實際生活情況判讀。</div>
    </details>
  `;
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
    ${renderComparison(review, utils)}
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
