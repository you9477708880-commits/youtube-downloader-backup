import { buildGoalCenterData } from "../domain/goal-center.js";

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeFilter(value) {
  return ["active", "considering"].includes(value) ? value : "all";
}

function renderActiveGoals(goals, utils) {
  if (!goals.length) return '<div class="empty goal-center-empty">目前沒有準備中的目標。</div>';
  return goals.map((goal) => {
    const goalId = utils.escapeHTML(goal.id);
    const targetMonth = goal.targetMonth ? `目標 ${utils.escapeHTML(goal.targetMonth)}` : "尚未設定目標月份";
    const planText = goal.planStatus
      ? goal.planStatus.isFeasible
        ? "依目前每月提撥可達成"
        : `期限前仍差 ${utils.formatMoney(goal.planStatus.shortfall)}`
      : "可設定目標月份以檢查可達成性";
    return `
      <article class="goal-center-item">
        <div class="goal-center-item-head">
          <div>
            <div class="goal-center-name">${utils.escapeHTML(goal.name)}</div>
            <div class="goal-center-meta">${targetMonth} · 每月提撥 ${utils.formatMoney(goal.monthlyContribution)}</div>
          </div>
          <div class="goal-center-amount">${utils.formatMoney(goal.currentSaved)} / ${utils.formatMoney(goal.targetAmount)}</div>
        </div>
        <div class="bud-track"><div class="bud-fill goal-center-progress" style="width:${clampPercent(goal.progress)}%"></div></div>
        <div class="bud-labels"><span>${utils.escapeHTML(planText)}</span><span>${clampPercent(goal.progress).toFixed(1)}%</span></div>
        <div class="goal-center-actions">
          <button type="button" class="sbtn outline compact" data-action="open-fund" data-id="${goalId}">查看明細</button>
          <button type="button" class="sbtn outline compact" data-action="edit-fund" data-id="${goalId}">調整計畫</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderWishCandidates(wishes, utils) {
  if (!wishes.length) return '<div class="empty goal-center-empty">目前沒有考慮中的目標。</div>';
  return wishes.map((wish) => {
    const wishId = utils.escapeHTML(wish.id);
    return `
      <article class="goal-center-wish">
        <div class="goal-center-order ${wish.withinBudget ? "is-ready" : ""}">${wish.order}</div>
        <div class="goal-center-wish-main">
          <div class="goal-center-name">${utils.escapeHTML(wish.name)}</div>
          <div class="goal-center-meta">${utils.escapeHTML(wish.category)} · ${wish.withinBudget ? "目前自由運用範圍內" : "尚超出自由運用"}</div>
        </div>
        <div class="goal-center-amount">${utils.formatMoney(wish.price)}</div>
        <button type="button" class="sbtn compact goal-center-prepare" data-action="prepare-fund-from-wish" data-id="${wishId}">建立準備</button>
      </article>
    `;
  }).join("");
}

export function renderGoalCenter({ state, filterRange, utils, dom }) {
  if (!dom.goalCenter) return;
  const detailsWereOpen = !!dom.goalCenter.querySelector?.(".goal-center-details")?.open;
  const model = buildGoalCenterData(state, filterRange);
  const filter = normalizeFilter(dom.goalCenter.dataset.filter);
  dom.goalCenter.dataset.filter = filter;
  const showActive = filter !== "considering";
  const showConsidering = filter !== "active";
  const visibleCount = (showActive ? model.activeFundGoals.length : 0) + (showConsidering ? model.wishCandidates.length : 0);

  const attention = model.attentionItems.length
    ? `
      <div class="goal-center-attention" ${showActive ? "" : "hidden"}>
        <strong>需要注意</strong>
        ${model.attentionItems.map((item) => `<div>${utils.escapeHTML(item.title)}：依目前每月提撥，期限前仍差 ${utils.formatMoney(item.amount)}。系統不會自動改動計畫。</div>`).join("")}
      </div>
    `
    : "";

  dom.goalCenter.innerHTML = `
    <div class="goal-center-head">
      <div>
        <div class="goal-center-title">目標中心</div>
        <div class="goal-center-intro">把想做的事分成「準備中」與「考慮中」，願望不會被當成實際支出。</div>
      </div>
    </div>
    <div class="goal-center-summary">
      <div class="mc"><div class="lb">本月可分配到目標</div><div class="vl text-inc">${utils.formatMoney(model.allocationRoom)}</div></div>
      <div class="mc"><div class="lb">本月既有規劃提撥</div><div class="vl">${utils.formatMoney(model.plannedFundContribution)}</div></div>
      <div class="mc"><div class="lb">本月額外補入</div><div class="vl">${utils.formatMoney(model.manualTopups)}</div></div>
    </div>
    ${attention}
    <details class="goal-center-details" ${detailsWereOpen ? "open" : ""}>
      <summary>
        <span>查看目標清單</span>
        <span class="goal-center-detail-count">準備中 ${model.activeFundGoals.length} 項 · 考慮中 ${model.wishCandidates.length} 項</span>
      </summary>
      <div class="goal-center-detail-body">
        <div class="goal-center-filters" aria-label="篩選目標">
          ${[["all", "全部"], ["active", "準備中"], ["considering", "考慮中"]].map(([value, label]) => `
            <button type="button" class="goal-center-filter ${filter === value ? "on" : ""}" data-action="filter-goals" data-filter="${value}">${label}</button>
          `).join("")}
        </div>
        <div class="goal-center-columns">
          <section class="goal-center-pane" ${showActive ? "" : "hidden"}>
            <div class="goal-center-pane-title">準備中的目標 <span>${model.activeFundGoals.length} 項</span></div>
            ${renderActiveGoals(model.activeFundGoals, utils)}
          </section>
          <section class="goal-center-pane" ${showConsidering ? "" : "hidden"}>
            <div class="goal-center-pane-title">考慮中的目標 <span>${model.wishCandidates.length} 項</span></div>
            ${renderWishCandidates(model.wishCandidates, utils)}
          </section>
        </div>
        ${visibleCount ? "" : '<div class="empty goal-center-empty">此篩選目前沒有項目。</div>'}
      </div>
    </details>
  `;
}
