import { calculateBudgetData } from "../domain/budget.js";
import { buildWishPlan } from "../domain/wishes.js";

export function renderWishlist({ state, filterRange, constants, utils, dom }) {
  const budget = calculateBudgetData(state, filterRange);
  const isSpreadMode = budget.viewMode === "spread";
  const renderCategoryItems = (items) =>
    items.length
      ? `
        <div class="detail-list">
          ${items
            .map(
              (entry) => `
                <div class="detail-row">
                  <div class="detail-main">
                    <div class="detail-title">${utils.escapeHTML(entry.spreadLabel || entry.desc || entry.cat || "未命名支出")}</div>
                    <div class="detail-sub">
                      ${utils.escapeHTML(entry.date)}
                      ｜${entry.isSpread ? `分攤認列 ${utils.formatMoney(entry.amount)} / 原始 ${utils.formatMoney(entry.originalAmount)}` : `實際支出 ${utils.formatMoney(entry.amount)}`}
                      ${entry.isSpread && entry.spreadMonths ? `｜${entry.spreadMonths} 個月` : ""}
                    </div>
                  </div>
                  <div class="detail-amt text-exp">-${utils.formatMoney(entry.amount)}</div>
                </div>
              `,
            )
            .join("")}
        </div>
      `
      : '<div class="empty detail-empty">本分類本期沒有明細</div>';
  const renderBudgetItems = (items) =>
    items.length
      ? `
        <div class="detail-list">
          ${items
            .map(
              (entry) => `
                <div class="detail-row">
                  <div class="detail-main">
                    <div class="detail-title">${utils.escapeHTML(entry.spreadLabel || entry.desc || entry.cat || "未命名支出")}</div>
                    <div class="detail-sub">
                      ${utils.escapeHTML(entry.date)}
                      ｜${utils.escapeHTML(entry.cat || "未分類")}
                      ｜${entry.isSpread ? `本期認列 ${utils.formatMoney(entry.amount)} / 原始 ${utils.formatMoney(entry.originalAmount)}` : `實際支出 ${utils.formatMoney(entry.amount)}`}
                    </div>
                  </div>
                  <div class="detail-amt text-exp">-${utils.formatMoney(entry.amount)}</div>
                </div>
              `,
            )
            .join("")}
        </div>
      `
      : '<div class="empty detail-empty">本期沒有納入預算的支出明細</div>';

  dom.budgetCap.textContent = utils.formatMoney(budget.cap);
  dom.budgetExpense.textContent = utils.formatMoney(budget.expense);
  dom.budgetAvailable.textContent = utils.formatMoney(budget.available);
  dom.budgetPlanningRoom.textContent = utils.formatMoney(budget.planningRoom);
  dom.budgetExpenseLabel.textContent = isSpreadMode ? "期間已支出（分攤後）" : "期間已支出（實際）";
  dom.budgetModeNote.textContent = isSpreadMode
    ? "目前以分攤後支出計算，適合看長期預算節奏。"
    : "目前以實際交易日認列支出，適合看本期真實花費。";

  dom.overviewFill.style.width = `${budget.percentage}%`;
  dom.overviewFill.style.background = budget.percentage > 100 ? "var(--red-m)" : budget.percentage > 80 ? "var(--amb-m)" : "var(--grn-m)";
  dom.overviewCapLabel.textContent = utils.formatMoney(budget.cap);
  dom.overviewBudget.textContent = utils.formatMoney(Math.max(0, budget.available));
  dom.overviewBudget.className = `vl ${budget.available <= 0 ? "text-exp" : budget.available < budget.cap * 0.2 ? "text-warn" : "text-inc"}`;
  dom.budgetSourceList.innerHTML = renderBudgetItems(budget.budgetItems);

  dom.categoryBudgetList.innerHTML = budget.categoryBudgets.length
    ? budget.categoryBudgets
        .map((item) => {
          const color = item.percentage > 100 ? "var(--red-m)" : item.percentage > 80 ? "var(--amb-m)" : "var(--blue-m)";
          return `
            <details class="drill mb-3">
              <summary>
                <div class="slh"><span class="sll">${utils.escapeHTML(item.category)}</span><span class="slv text-sm">${utils.formatMoney(item.expense)} / ${utils.formatMoney(item.budget)} <button type="button" class="del-btn d-inline-flex px-1 ml-2 text-lg p-1" data-action="del-cat-budget" data-cat="${utils.escapeHTML(item.category)}">✕</button></span></div>
                <div class="bud-track mt-1" style="height:8px"><div class="bud-fill" style="width:${item.percentage}%;background:${color}"></div></div>
              </summary>
              ${renderCategoryItems(item.items)}
            </details>
          `;
        })
        .join("")
    : '<div class="empty p-2">尚未設定任何類別預算</div>';

  dom.budgetSpreadList.innerHTML = isSpreadMode
    ? budget.spreadItems.length
      ? budget.spreadItems
          .map((item) => `
            <div class="spread-item">
              <div class="top">
                <div>
                  <div class="title">${utils.escapeHTML(item.spreadLabel || item.desc || item.cat || "大額支出")}</div>
                  <div class="sub">${utils.escapeHTML(item.date)}｜原始支出 ${utils.formatMoney(item.amount)}｜${utils.escapeHTML(item.cat)}</div>
                  <div class="spread-chip">本期認列 ${utils.formatMoney(item.periodAmount)} / ${item.spreadMonths} 個月</div>
                </div>
                <div class="text-right">
                  <div class="font-mono text-inc">${utils.formatMoney(item.periodAmount)}</div>
                  <div class="sub">${item.coveredMonths} 個月落在本次區間</div>
                </div>
              </div>
            </div>
          `)
          .join("")
      : '<div class="empty p-2">本次區間沒有分攤中的大額支出</div>'
    : "";

  const plannedWishes = buildWishPlan(state.wishes, budget.available);
  dom.wishList.innerHTML = plannedWishes.length
    ? plannedWishes
        .map((wish) => `
          <div class="wish-item">
            <div class="flex-col gap-1 flex-shrink-0">
              <button type="button" class="tb p-1 text-xs" data-action="mv-wish" data-id="${wish.id}" data-dir="-1">▲</button>
              <button type="button" class="tb p-1 text-xs" data-action="mv-wish" data-id="${wish.id}" data-dir="1">▼</button>
            </div>
            <div class="wish-num ${wish.withinBudget ? "bg-inc-light text-inc" : "bg-exp-light text-exp"} w-24px h-24px">${wish.order}</div>
            <div class="wish-info">
              <div class="wish-name">${utils.escapeHTML(wish.name)}</div>
              <div class="wish-sub">${constants.wishCategoryIcons[wish.cat] || "📦"} ${utils.escapeHTML(wish.cat)} 累計 ${utils.formatMoney(wish.cumulative)}</div>
            </div>
            <div class="wish-right">
              <div class="flex-col align-end gap-1">
                <div class="wish-price">${utils.formatMoney(wish.price)}</div>
                <div class="wish-st ${wish.withinBudget ? "text-inc" : "text-exp"}">${wish.withinBudget ? "✓ 額度內" : "✕ 超出額度"}</div>
              </div>
              <button type="button" class="del-btn text-lg p-1 ml-1" data-action="del-wish" data-id="${wish.id}">✕</button>
            </div>
          </div>
        `)
        .join("")
    : '<div class="empty">尚未加入任何項目</div>';
}
