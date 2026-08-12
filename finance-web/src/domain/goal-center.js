import { calculateBudgetData } from "./budget.js";
import { getFundTargetPlanStatus } from "./sinking-funds.js";
import { buildWishPlan } from "./wishes.js";

export function buildGoalCenterData(state, range) {
  const budget = calculateBudgetData(state, range);
  const activeFundGoals = budget.funds.map((fund) => {
    const planStatus = fund.targetMonth ? getFundTargetPlanStatus(fund) : null;
    return {
      id: fund.id,
      name: fund.name,
      category: fund.category || "未分類",
      targetAmount: fund.targetAmount,
      targetMonth: fund.targetMonth || "",
      monthlyContribution: fund.monthlyContribution,
      currentSaved: fund.currentSaved,
      remaining: fund.remaining,
      progress: fund.progress,
      planStatus,
    };
  });

  const wishCandidates = buildWishPlan(state.wishes || [], budget.freeToUse).map((wish) => ({
    id: wish.id,
    name: wish.name,
    category: wish.cat || "未分類",
    price: wish.price,
    order: wish.order,
    cumulative: wish.cumulative,
    withinBudget: wish.withinBudget,
  }));

  const attentionItems = activeFundGoals.flatMap((goal) => {
    const items = [];
    if (goal.planStatus && !goal.planStatus.isFeasible) {
      items.push({
        id: `fund-plan:${goal.id}`,
        kind: "fund-plan-shortfall",
        goalId: goal.id,
        title: goal.name,
        amount: goal.planStatus.shortfall,
      });
    }
    return items;
  });

  return {
    allocationRoom: budget.freeToUse,
    plannedFundContribution: budget.fundContribution,
    manualTopups: budget.manualTopups,
    activeFundGoals,
    wishCandidates,
    attentionItems,
  };
}
