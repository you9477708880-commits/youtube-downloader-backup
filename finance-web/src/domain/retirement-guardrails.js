const RATE_EPSILON = 0.0000001;

export const GUARDRAIL_DEFAULTS = Object.freeze({
  initialWithdrawalRatePct: 5.3,
  lowerMultiplier: 0.8,
  upperMultiplier: 1.2,
  adjustmentMultiplier: 0.1,
  capitalPreservationFinalYears: 15,
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedPercent(value) {
  return Math.max(0, finiteNumber(value));
}

function normalizeAllocation(allocation = {}) {
  return {
    stock: normalizedPercent(allocation.stock),
    bond: normalizedPercent(allocation.bond),
    cash: normalizedPercent(allocation.cash),
  };
}

function allocationTotal(allocation) {
  return allocation.stock + allocation.bond + allocation.cash;
}

function isValidAllocation(allocation) {
  return Math.abs(allocationTotal(allocation) - 100) < 0.01;
}

export function calculateGuardrailDecision({
  portfolioValue,
  initialWithdrawalRatePct = GUARDRAIL_DEFAULTS.initialWithdrawalRatePct,
  priorAnnualWithdrawal,
  inflationRatePct = 0,
  priorPortfolioReturnPct = 0,
  currentAge,
  maximumAge,
}) {
  const portfolio = Math.max(0, finiteNumber(portfolioValue));
  const annualWithdrawal = Math.max(0, finiteNumber(priorAnnualWithdrawal));
  const initialRate = normalizedPercent(initialWithdrawalRatePct) / 100;
  const inflationRate = Math.max(0, finiteNumber(inflationRatePct)) / 100;
  const priorReturn = finiteNumber(priorPortfolioReturnPct);
  const age = Math.max(0, finiteNumber(currentAge));
  const maxAge = Math.max(age, finiteNumber(maximumAge, age));
  const lowerRate = initialRate * GUARDRAIL_DEFAULTS.lowerMultiplier;
  const upperRate = initialRate * GUARDRAIL_DEFAULTS.upperMultiplier;
  const currentRate = portfolio > 0 ? annualWithdrawal / portfolio : Number.POSITIVE_INFINITY;
  const capitalPreservationCutoffAge = Math.max(0, maxAge - GUARDRAIL_DEFAULTS.capitalPreservationFinalYears);
  const capitalPreservationActive = age <= capitalPreservationCutoffAge;
  const valid = portfolio > 0 && annualWithdrawal > 0 && initialRate > 0;

  let action = "inflation-adjust";
  let nextAnnualWithdrawal = annualWithdrawal * (1 + inflationRate);

  if (currentRate > upperRate + RATE_EPSILON && capitalPreservationActive) {
    action = "reduce-ten-percent";
    nextAnnualWithdrawal = annualWithdrawal * (1 - GUARDRAIL_DEFAULTS.adjustmentMultiplier);
  } else if (currentRate < lowerRate - RATE_EPSILON) {
    action = "increase-ten-percent";
    nextAnnualWithdrawal = annualWithdrawal * (1 + GUARDRAIL_DEFAULTS.adjustmentMultiplier);
  } else if (priorReturn < 0 && currentRate > initialRate + RATE_EPSILON) {
    action = "freeze-inflation";
    nextAnnualWithdrawal = annualWithdrawal;
  }

  return {
    valid,
    reason: valid ? "" : "portfolio-withdrawal-and-initial-rate-required",
    portfolioValue: portfolio,
    priorAnnualWithdrawal: annualWithdrawal,
    currentRate,
    initialRate,
    lowerRate,
    upperRate,
    inflationRate,
    priorPortfolioReturnPct: priorReturn,
    action,
    nextAnnualWithdrawal,
    nextMonthlyWithdrawal: nextAnnualWithdrawal / 12,
    capitalPreservationActive,
    capitalPreservationCutoffAge,
  };
}

export function calculateWithdrawalSourcePlan({
  portfolioValue,
  currentAllocation,
  targetAllocation,
  annualWithdrawal,
  priorStockReturnPct = 0,
  priorBondReturnPct = 0,
  emergencyReserve = 0,
  allowEmergencyReserve = false,
}) {
  const portfolio = Math.max(0, finiteNumber(portfolioValue));
  const withdrawal = Math.max(0, finiteNumber(annualWithdrawal));
  const current = normalizeAllocation(currentAllocation);
  const target = normalizeAllocation(targetAllocation);
  const reserve = Math.max(0, finiteNumber(emergencyReserve));

  if (!isValidAllocation(current) || !isValidAllocation(target)) {
    return {
      valid: false,
      reason: "allocation-total-must-be-100",
      currentAllocation: current,
      targetAllocation: target,
      currentTotal: allocationTotal(current),
      targetTotal: allocationTotal(target),
      steps: [],
    };
  }

  const available = {
    stock: portfolio * current.stock / 100,
    bond: portfolio * current.bond / 100,
    cash: portfolio * current.cash / 100,
    emergency: allowEmergencyReserve ? reserve : 0,
  };
  const targetAmounts = {
    stock: portfolio * target.stock / 100,
    bond: portfolio * target.bond / 100,
    cash: portfolio * target.cash / 100,
  };
  const initialCash = available.cash;
  const initialEmergency = available.emergency;
  const steps = [];
  let remaining = withdrawal;

  const consume = (source, label, limit = available[source]) => {
    const amount = Math.min(remaining, Math.max(0, Math.min(available[source], limit)));
    if (amount <= 0) return;
    available[source] -= amount;
    remaining -= amount;
    steps.push({ source, label, amount });
  };

  if (finiteNumber(priorStockReturnPct) > 0) {
    consume("stock", "賣出上漲且超過目標配置的股票", available.stock - targetAmounts.stock);
  }
  if (finiteNumber(priorBondReturnPct) > 0) {
    consume("bond", "賣出上漲且超過目標配置的債券", available.bond - targetAmounts.bond);
  }
  consume("cash", "使用投資組合內現金");
  consume("bond", "使用其餘債券");
  if (allowEmergencyReserve) consume("emergency", "使用已允許動用的緊急預備金");
  consume("stock", finiteNumber(priorStockReturnPct) < 0 ? "其他來源不足，最後才賣出下跌股票" : "使用其餘股票");

  const usedBySource = Object.fromEntries(["stock", "bond", "cash", "emergency"].map((source) => [
    source,
    steps.filter((step) => step.source === source).reduce((sum, step) => sum + step.amount, 0),
  ]));

  return {
    valid: true,
    currentAllocation: current,
    targetAllocation: target,
    currentTotal: 100,
    targetTotal: 100,
    annualWithdrawal: withdrawal,
    emergencyReserve: reserve,
    allowEmergencyReserve,
    cashBufferYears: withdrawal > 0 ? initialCash / withdrawal : 0,
    protectedBufferYears: withdrawal > 0 ? (initialCash + initialEmergency) / withdrawal : 0,
    steps,
    usedBySource,
    remainingUnfunded: Math.max(0, remaining),
    avoidedSellingDownStock: finiteNumber(priorStockReturnPct) < 0 && usedBySource.stock === 0,
  };
}
