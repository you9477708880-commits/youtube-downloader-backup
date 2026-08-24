import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateGuardrailDecision,
  calculateWithdrawalSourcePlan,
} from "../src/domain/retirement-guardrails.js";

test("capital preservation cuts ten percent above the upper guardrail", () => {
  const decision = calculateGuardrailDecision({
    portfolioValue: 16000000,
    initialWithdrawalRatePct: 5.3,
    priorAnnualWithdrawal: 1080000,
    inflationRatePct: 2,
    priorPortfolioReturnPct: -20,
    currentAge: 70,
    maximumAge: 90,
  });

  assert.equal(decision.action, "reduce-ten-percent");
  assert.equal(decision.currentRate, 0.0675);
  assert.ok(Math.abs(decision.upperRate - 0.0636) < 0.0000001);
  assert.equal(decision.nextAnnualWithdrawal, 972000);
  assert.equal(decision.nextMonthlyWithdrawal, 81000);
  assert.equal(decision.capitalPreservationCutoffAge, 75);
  assert.equal(decision.capitalPreservationActive, true);
  assert.equal(decision.valid, true);
});

test("guardrail decision marks missing core inputs invalid", () => {
  const decision = calculateGuardrailDecision({
    portfolioValue: 20000000,
    initialWithdrawalRatePct: 0,
    priorAnnualWithdrawal: 1060000,
    currentAge: 70,
    maximumAge: 90,
  });

  assert.equal(decision.valid, false);
  assert.equal(decision.reason, "portfolio-withdrawal-and-initial-rate-required");
});

test("negative-return inflation freeze requires a rate above the initial rate", () => {
  const frozen = calculateGuardrailDecision({
    portfolioValue: 19000000,
    initialWithdrawalRatePct: 5.3,
    priorAnnualWithdrawal: 1060000,
    inflationRatePct: 2,
    priorPortfolioReturnPct: -5,
    currentAge: 70,
    maximumAge: 90,
  });
  const adjusted = calculateGuardrailDecision({
    portfolioValue: 22000000,
    initialWithdrawalRatePct: 5.3,
    priorAnnualWithdrawal: 1060000,
    inflationRatePct: 2,
    priorPortfolioReturnPct: -5,
    currentAge: 70,
    maximumAge: 90,
  });

  assert.equal(frozen.action, "freeze-inflation");
  assert.equal(frozen.nextAnnualWithdrawal, 1060000);
  assert.equal(adjusted.action, "inflation-adjust");
  assert.equal(adjusted.nextAnnualWithdrawal, 1081200);
});

test("prosperity rule raises the withdrawal ten percent below the lower guardrail", () => {
  const decision = calculateGuardrailDecision({
    portfolioValue: 28000000,
    initialWithdrawalRatePct: 5.3,
    priorAnnualWithdrawal: 1060000,
    inflationRatePct: 2,
    priorPortfolioReturnPct: 10,
    currentAge: 70,
    maximumAge: 90,
  });

  assert.equal(decision.action, "increase-ten-percent");
  assert.equal(decision.nextAnnualWithdrawal, 1166000);
});

test("capital preservation expires fifteen years before maximum age", () => {
  const decision = calculateGuardrailDecision({
    portfolioValue: 16000000,
    initialWithdrawalRatePct: 5.3,
    priorAnnualWithdrawal: 1080000,
    inflationRatePct: 2,
    priorPortfolioReturnPct: -10,
    currentAge: 80,
    maximumAge: 90,
  });

  assert.equal(decision.capitalPreservationActive, false);
  assert.equal(decision.action, "freeze-inflation");
  assert.equal(decision.nextAnnualWithdrawal, 1080000);
});

test("positive overweight stock is used before cash and bonds", () => {
  const plan = calculateWithdrawalSourcePlan({
    portfolioValue: 20000000,
    currentAllocation: { stock: 70, bond: 20, cash: 10 },
    targetAllocation: { stock: 60, bond: 30, cash: 10 },
    annualWithdrawal: 1060000,
    priorStockReturnPct: 12,
    priorBondReturnPct: 1,
  });

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.steps, [{
    source: "stock",
    label: "賣出上漲且超過目標配置的股票",
    amount: 1060000,
  }]);
});

test("positive overweight stock and bonds are consumed in that order", () => {
  const plan = calculateWithdrawalSourcePlan({
    portfolioValue: 20000000,
    currentAllocation: { stock: 65, bond: 30, cash: 5 },
    targetAllocation: { stock: 60, bond: 25, cash: 15 },
    annualWithdrawal: 2000000,
    priorStockReturnPct: 12,
    priorBondReturnPct: 4,
  });

  assert.deepEqual(plan.steps.map(({ source, amount }) => ({ source, amount })), [
    { source: "stock", amount: 1000000 },
    { source: "bond", amount: 1000000 },
  ]);
});

test("cash avoids selling down stock when it fully covers the withdrawal", () => {
  const plan = calculateWithdrawalSourcePlan({
    portfolioValue: 20000000,
    currentAllocation: { stock: 60, bond: 30, cash: 10 },
    targetAllocation: { stock: 60, bond: 30, cash: 10 },
    annualWithdrawal: 1060000,
    priorStockReturnPct: -25,
    priorBondReturnPct: -5,
  });

  assert.deepEqual(plan.steps, [{
    source: "cash",
    label: "使用投資組合內現金",
    amount: 1060000,
  }]);
  assert.equal(plan.avoidedSellingDownStock, true);
  assert.equal(plan.cashBufferYears, 2000000 / 1060000);
});

test("emergency reserve is opt-in and sits before a final down-stock sale", () => {
  const input = {
    portfolioValue: 20000000,
    currentAllocation: { stock: 93, bond: 5, cash: 2 },
    targetAllocation: { stock: 60, bond: 30, cash: 10 },
    annualWithdrawal: 2000000,
    priorStockReturnPct: -30,
    priorBondReturnPct: -5,
    emergencyReserve: 1000000,
  };
  const withReserve = calculateWithdrawalSourcePlan({ ...input, allowEmergencyReserve: true });
  const withoutReserve = calculateWithdrawalSourcePlan({ ...input, allowEmergencyReserve: false });

  assert.deepEqual(withReserve.steps.map(({ source, amount }) => ({ source, amount })), [
    { source: "cash", amount: 400000 },
    { source: "bond", amount: 1000000 },
    { source: "emergency", amount: 600000 },
  ]);
  assert.equal(withReserve.avoidedSellingDownStock, true);
  assert.equal(withReserve.protectedBufferYears, 0.7);
  assert.deepEqual(withoutReserve.steps.map(({ source, amount }) => ({ source, amount })), [
    { source: "cash", amount: 400000 },
    { source: "bond", amount: 1000000 },
    { source: "stock", amount: 600000 },
  ]);
  assert.equal(withoutReserve.avoidedSellingDownStock, false);
});

test("allocation validation rejects totals other than one hundred without mutating inputs", () => {
  const input = {
    portfolioValue: 20000000,
    currentAllocation: { stock: 60, bond: 20, cash: 10 },
    targetAllocation: { stock: 60, bond: 30, cash: 10 },
    annualWithdrawal: 1000000,
  };
  const before = structuredClone(input);
  const plan = calculateWithdrawalSourcePlan(input);

  assert.equal(plan.valid, false);
  assert.equal(plan.reason, "allocation-total-must-be-100");
  assert.equal(plan.currentTotal, 90);
  assert.deepEqual(input, before);
});
