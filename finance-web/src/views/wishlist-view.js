import { calculateBudgetData } from "../domain/budget.js";
import { buildWishPlan } from "../domain/wishes.js";

export function renderWishlist({ state, filteredTxs, constants, utils, dom }) {
  const budget = calculateBudgetData(state, filteredTxs);

  dom.budgetCap.textContent = utils.formatMoney(budget.cap);
  dom.budgetExpense.textContent = utils.formatMoney(budget.expense);
  dom.budgetAvailable.textContent = utils.formatMoney(budget.available);

  dom.overviewFill.style.width = `${budget.percentage}%`;
  dom.overviewFill.style.background = budget.percentage > 100 ? "var(--red-m)" : budget.percentage > 80 ? "var(--amb-m)" : "var(--grn-m)";
  dom.overviewCapLabel.textContent = utils.formatMoney(budget.cap);
  dom.overviewBudget.textContent = utils.formatMoney(Math.max(0, budget.remaining));
  dom.overviewBudget.className = `vl ${budget.remaining < 0 ? "text-exp" : budget.remaining < budget.cap * 0.2 ? "text-warn" : "text-inc"}`;

  dom.categoryBudgetList.innerHTML = budget.categoryBudgets.length
    ? budget.categoryBudgets
        .map((item) => {
          const color = item.percentage > 100 ? "var(--red-m)" : item.percentage > 80 ? "var(--amb-m)" : "var(--blue-m)";
          return `
            <div class="mb-3">
              <div class="slh"><span class="sll">${utils.escapeHTML(item.category)}</span><span class="slv text-sm">${utils.formatMoney(item.expense)} / ${utils.formatMoney(item.budget)} <button type="button" class="del-btn d-inline-flex px-1 ml-2 text-lg p-1" data-action="del-cat-budget" data-cat="${utils.escapeHTML(item.category)}">✕</button></span></div>
              <div class="bud-track mt-1" style="height:8px"><div class="bud-fill" style="width:${item.percentage}%;background:${color}"></div></div>
            </div>
          `;
        })
        .join("")
    : '<div class="empty p-2">尚未設定任何類別預算</div>';

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
