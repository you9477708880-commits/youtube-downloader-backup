import { calculateBudgetData } from "../domain/budget.js";
import { getFundTargetPlanStatus, getLinkedFundSpendAmount } from "../domain/sinking-funds.js";
import { buildWishPlan } from "../domain/wishes.js";

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function renderFundEvents(fund, state, utils) {
  const events = [...(fund.events || [])].sort((a, b) => b.date.localeCompare(a.date));
  if (!events.length) return '<div class="empty detail-empty">目前還沒有任何補入或動用紀錄。</div>';

  return `
    <div class="detail-list">
      ${events
        .map((event) => {
          const tx = event.linkedTxId ? state.txs.find((item) => String(item.id) === String(event.linkedTxId)) : null;
          const isTopup = event.type === "topup";
          const title = isTopup ? "補入準備" : "動用準備";
          const subtitle = isTopup
            ? event.note || "手動補入"
            : `${event.note || "支出"}${tx ? ` ｜ 對應交易：${utils.escapeHTML(tx.desc || tx.cat || "未命名支出")}` : ""}`;
          return `
            <div class="detail-row">
              <div class="detail-main">
                <div class="detail-title">${title}</div>
                <div class="detail-sub">${utils.escapeHTML(event.date)} ｜ ${utils.escapeHTML(subtitle)}</div>
              </div>
              <div class="detail-amt ${isTopup ? "text-inc" : "text-exp"}">${isTopup ? "+" : "-"}${utils.formatMoney(event.amount)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderLinkedFundTransactions(fund, state, utils) {
  const eventLinkedIds = new Set((fund.events || []).map((event) => String(event.linkedTxId || "")).filter(Boolean));
  const linkedTransactions = (state.txs || [])
    .filter((tx) => String(tx.linkedFundId || "") === String(fund.id) || eventLinkedIds.has(String(tx.id)))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  if (!linkedTransactions.length) return '<div class="empty detail-empty">目前還沒有對應交易。</div>';

  return `
    <div class="detail-list">
      ${linkedTransactions
        .map((tx) => {
          const fundPaid = Math.min(tx.amount || 0, getLinkedFundSpendAmount(fund, tx.id));
          const currentMonthExpense = Math.max(0, (tx.amount || 0) - fundPaid);
          const title = tx.desc || tx.cat || "未命名支出";
          const subtitle =
            currentMonthExpense > 0
              ? `原始支出 ${utils.formatMoney(tx.amount)} ｜ 準備支付 ${utils.formatMoney(fundPaid)} ｜ 本月支出 ${utils.formatMoney(currentMonthExpense)}`
              : `原始支出 ${utils.formatMoney(tx.amount)} ｜ 準備支付 ${utils.formatMoney(fundPaid)} ｜ 本月不另外扣款`;

          return `
            <div class="detail-row">
              <div class="detail-main">
                <div class="detail-title">${utils.escapeHTML(title)}</div>
                <div class="detail-sub">${utils.escapeHTML(tx.date || "")} ｜ ${utils.escapeHTML(subtitle)}</div>
              </div>
              <div class="detail-amt text-exp">-${utils.formatMoney(tx.amount)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

export function renderWishlist({ state, filterRange, constants, utils, dom }) {
  const budget = calculateBudgetData(state, filterRange);

  const renderSourceItems = (items) =>
    items.length
      ? `
        <div class="detail-list">
          ${items
            .map(
              (item) => `
                <div class="detail-row">
                  <div class="detail-main">
                    <div class="detail-title">${utils.escapeHTML(item.title)}</div>
                    <div class="detail-sub">${utils.escapeHTML(item.date)} ｜ ${utils.escapeHTML(item.subtitle)}</div>
                  </div>
                  <div class="detail-amt text-exp">-${utils.formatMoney(item.amount)}</div>
                </div>
              `,
            )
            .join("")}
        </div>
      `
      : '<div class="empty detail-empty">本期還沒有需要分配的項目。</div>';

  const renderCategoryItems = (items) =>
    items.length
      ? `
        <div class="detail-list">
          ${items
            .map(
              (item) => `
                <div class="detail-row">
                  <div class="detail-main">
                    <div class="detail-title">${utils.escapeHTML(item.title)}</div>
                    <div class="detail-sub">${utils.escapeHTML(item.date)} ｜ ${utils.escapeHTML(item.subtitle)}</div>
                  </div>
                  <div class="detail-amt text-exp">-${utils.formatMoney(item.amount)}</div>
                </div>
              `,
            )
            .join("")}
        </div>
      `
      : '<div class="empty detail-empty">這個分類本期沒有支出。</div>';

  dom.budgetCap.textContent = utils.formatMoney(budget.cap);
  dom.budgetExpense.textContent = utils.formatMoney(budget.livingExpense);
  dom.budgetFundContribution.textContent = utils.formatMoney(budget.fundContribution);
  dom.budgetAvailable.textContent = utils.formatMoney(budget.freeToUse);
  if (dom.budgetPlanningRoom) dom.budgetPlanningRoom.textContent = utils.formatMoney(budget.freeToUse);
  dom.budgetModeNote.textContent = "先預留生活支出和大額支出準備，再看這個月還剩多少能自由運用。";
  dom.leftoverNote.textContent =
    budget.freeToUse > 0
      ? `目前可自由運用 ${utils.formatMoney(budget.freeToUse)}。如果你手動補入大額準備，這裡會一起反映。`
      : "本月可自由運用已用完；如果要再安排支出，建議先調整生活支出或大額準備。";

  const progressPercent = budget.cap > 0 ? clampPercent(((budget.livingExpense + budget.fundContribution + budget.manualTopups) / budget.cap) * 100) : 0;
  dom.overviewFill.style.width = `${progressPercent}%`;
  dom.overviewFill.style.background =
    progressPercent > 100 ? "var(--red-m)" : progressPercent > 80 ? "var(--amb-m)" : "var(--grn-m)";
  dom.overviewCapLabel.textContent = utils.formatMoney(budget.cap);
  dom.overviewBudget.textContent = utils.formatMoney(budget.freeToUse);
  dom.overviewBudget.className = `vl ${
    budget.freeToUse <= 0 ? "text-exp" : budget.freeToUse < budget.cap * 0.2 ? "text-warn" : "text-inc"
  }`;
  dom.budgetSourceList.innerHTML = renderSourceItems(budget.sourceItems);

  dom.fundList.innerHTML = budget.funds.length
    ? budget.funds
        .map((fund) => {
          const fundId = utils.escapeHTML(fund.id);
          const progress = clampPercent(fund.progress);
          const projectedDate = fund.targetMonth ? `目標月份 ${utils.escapeHTML(fund.targetMonth)}` : "尚未設定目標月份";
          const planStatus = fund.targetMonth ? getFundTargetPlanStatus(fund) : null;
          const planStatusText = planStatus
            ? planStatus.isFeasible
              ? `每月提撥預計可達標，規劃累積 ${utils.formatMoney(planStatus.plannedAmount)}`
              : `每月提撥到目標月份仍差 ${utils.formatMoney(planStatus.shortfall)}，可提高提撥、延後月份或手動補入`
            : "未設定目標月份，暫不檢查達標時間";
          const planStatusClass = planStatus && !planStatus.isFeasible ? "fund-plan-warn" : "fund-plan-ok";
          const statusText =
            fund.spendAmount > 0
              ? `本期已動用 ${utils.formatMoney(fund.spendAmount)}`
                : fund.topupAmount > 0
                  ? `本期已手動補入 ${utils.formatMoney(fund.topupAmount)}`
                : fund.carryoverEnabled
                  ? "可接受額外補入"
                  : "目前未開啟額外補入";

          return `
            <details class="fund-card drill" data-fund-card="${fundId}">
              <summary>
                <div class="fund-head">
                  <div>
                    <div class="fund-title">${utils.escapeHTML(fund.name)}</div>
                    <div class="fund-sub">${utils.escapeHTML(fund.category || "未分類")} ｜ 每月提撥 ${utils.formatMoney(fund.monthlyContribution)}</div>
                  </div>
                  <div class="fund-actions">
                    <button type="button" class="sbtn outline compact" data-action="topup-fund" data-id="${fundId}">手動補入</button>
                    <button type="button" class="sbtn outline compact" data-action="edit-fund" data-id="${fundId}">編輯</button>
                    <button type="button" class="del-btn text-lg p-1" data-action="del-fund" data-id="${fundId}" aria-label="刪除準備項目">×</button>
                  </div>
                </div>
                <div class="fund-grid">
                  <div><span class="fund-k">目標</span><span class="fund-v">${utils.formatMoney(fund.targetAmount)}</span></div>
                  <div><span class="fund-k">目前累積</span><span class="fund-v">${utils.formatMoney(fund.currentSaved)}</span></div>
                  <div><span class="fund-k">尚差</span><span class="fund-v">${utils.formatMoney(fund.remaining)}</span></div>
                  <div><span class="fund-k">本期提撥</span><span class="fund-v">${utils.formatMoney(fund.plannedContribution)}</span></div>
                </div>
                <div class="bud-track mt-2"><div class="bud-fill" style="width:${progress}%;background:var(--blue-m)"></div></div>
                <div class="bud-labels">
                  <span>${projectedDate}</span>
                  <span>${progress.toFixed(1)}%</span>
                </div>
                <div class="fund-note">
                  ${statusText}
                  ${fund.overspentAmount > 0 ? `｜目前超出 ${utils.formatMoney(fund.overspentAmount)}` : ""}
                  ${fund.note ? `｜${utils.escapeHTML(fund.note)}` : ""}
                </div>
                <div class="fund-plan-status ${planStatusClass}">${utils.escapeHTML(planStatusText)}</div>
              </summary>
              <div class="fund-detail-block">
                <div class="fund-detail-title">準備事件</div>
                ${renderFundEvents(fund, state, utils)}
              </div>
              <div class="fund-detail-block">
                <div class="fund-detail-title">對應交易</div>
                ${renderLinkedFundTransactions(fund, state, utils)}
              </div>
            </details>
          `;
        })
        .join("")
    : '<div class="empty">還沒有大額支出準備，先建立旅遊、手機或電腦準備會比較好規劃。</div>';

  dom.categoryBudgetList.innerHTML = budget.categoryBudgets.length
    ? budget.categoryBudgets
        .map((item) => {
          const percentage = item.budget > 0 ? (item.expense / item.budget) * 100 : 0;
          const color = percentage > 100 ? "var(--red-m)" : percentage > 80 ? "var(--amb-m)" : "var(--blue-m)";
          return `
            <details class="drill mb-3">
              <summary>
                <div class="slh">
                  <span class="sll">${utils.escapeHTML(item.category)}</span>
                  <span class="slv text-sm">
                    ${utils.formatMoney(item.expense)} / ${utils.formatMoney(item.budget)}
                    <button type="button" class="del-btn d-inline-flex px-1 ml-2 text-lg p-1" data-action="del-cat-budget" data-cat="${utils.escapeHTML(item.category)}">×</button>
                  </span>
                </div>
                <div class="bud-track mt-1"><div class="bud-fill" style="width:${clampPercent(percentage)}%;background:${color}"></div></div>
              </summary>
              ${renderCategoryItems(item.items)}
            </details>
          `;
        })
        .join("")
    : '<div class="empty p-2">還沒有設定分類預算。</div>';

  const plannedWishes = buildWishPlan(state.wishes, budget.freeToUse);
  dom.wishList.innerHTML = plannedWishes.length
    ? plannedWishes
        .map((wish) => {
          const wishId = utils.escapeHTML(wish.id);
          return `
          <div class="wish-item">
            <div class="flex-col gap-1 flex-shrink-0">
              <button type="button" class="tb p-1 text-xs" data-action="mv-wish" data-id="${wishId}" data-dir="-1">↑</button>
              <button type="button" class="tb p-1 text-xs" data-action="mv-wish" data-id="${wishId}" data-dir="1">↓</button>
            </div>
            <div class="wish-num ${wish.withinBudget ? "bg-inc-light text-inc" : "bg-exp-light text-exp"} w-24px h-24px">${wish.order}</div>
            <div class="wish-info">
              <div class="wish-name">${utils.escapeHTML(wish.name)}</div>
              <div class="wish-sub">${constants.wishCategoryIcons[wish.cat] || "🧾"} ${utils.escapeHTML(wish.cat)} ｜ 累積 ${utils.formatMoney(wish.cumulative)}</div>
            </div>
            <div class="wish-right">
              <div class="flex-col align-end gap-1">
                <div class="wish-price">${utils.formatMoney(wish.price)}</div>
                <div class="wish-st ${wish.withinBudget ? "text-inc" : "text-exp"}">${wish.withinBudget ? "目前可安排" : "超出可自由運用"}</div>
              </div>
              <button type="button" class="sbtn outline compact ml-1" data-action="edit-wish" data-id="${wishId}">編輯</button>
              <button type="button" class="del-btn text-lg p-1 ml-1" data-action="del-wish" data-id="${wishId}">×</button>
            </div>
          </div>
        `;
        })
        .join("")
    : '<div class="empty">還沒有待購項目。</div>';
}
