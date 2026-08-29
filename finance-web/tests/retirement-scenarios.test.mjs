import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateRetirementScenarios } from "../src/domain/retirement-scenarios.js";
import { renderRetirement } from "../src/views/retirement-view.js";

function sampleState() {
  return {
    txs: [],
    accounts: [{ id: "bank", name: "銀行", type: "asset", initialBalance: 500000 }],
    bsI: [],
    settings: { retLinked: false },
  };
}

function sampleInputs() {
  return {
    currentAsset: 500000,
    monthlyContribution: 10000,
    principalAnnualReturnRate: 6,
    contributionAnnualReturnRate: 6,
    inflationRate: 2,
    monthlyWithdraw: 40000,
    targetAsset: 20000000,
  };
}

test("retirement scenarios change one condition at a time without mutating inputs", () => {
  const state = sampleState();
  const inputs = sampleInputs();
  const before = { state: structuredClone(state), inputs: structuredClone(inputs) };

  const scenarios = calculateRetirementScenarios({
    state,
    currentAge: 30,
    retirementAge: 65,
    deathAge: 90,
    inputs,
  });

  assert.deepEqual(scenarios.map((scenario) => scenario.id), [
    "baseline",
    "delay-three-years",
    "withdraw-ten-percent-less",
  ]);
  assert.match(scenarios[1].description, /退休改為 68 歲/);
  assert.equal(scenarios[2].projection.monthlyWithdraw, 36000);
  assert.ok(scenarios[1].projection.retirementValue > scenarios[0].projection.retirementValue);
  assert.ok(scenarios[2].projection.minimumRequiredAsset < scenarios[0].projection.minimumRequiredAsset);
  assert.deepEqual(state, before.state);
  assert.deepEqual(inputs, before.inputs);
});

test("retirement scenario and guardrail rendering stay projection-only and explain their limits", () => {
  const node = (value = "") => ({ value, textContent: "", innerHTML: "", className: "", checked: false });
  const dom = {
    currentAge: node("30"), retirementAge: node("65"), deathAge: node("90"),
    retireAsset: node("500000"), retireMonthly: node("10000"),
    retirePrincipalReturn: node("6"), retireContributionReturn: node("6"),
    retireInflation: node("2"), retireWithdraw: node("40000"), retireTarget: node("20000000"),
    retireLinkedValue: node(), retireAssetValue: node(), retireAssetAtRetire: node(),
    retireAchieve: node(), retirePaid: node(), retireGain: node(), retireSuggestion: node(),
    retireScenarios: node(), retireTable: node(),
    retireGuardrailPortfolio: node("20000000"), retireGuardrailWithdrawal: node("1060000"),
    retireGuardrailInitialRate: node("5.3"), retireGuardrailPortfolioReturn: node("-10"),
    retireGuardrailCurrentStock: node("60"), retireGuardrailCurrentBond: node("30"), retireGuardrailCurrentCash: node("10"),
    retireGuardrailTargetStock: node("60"), retireGuardrailTargetBond: node("30"), retireGuardrailTargetCash: node("10"),
    retireGuardrailStockReturn: node("-20"), retireGuardrailBondReturn: node("-5"),
    retireGuardrailUseEmergency: node(), retireGuardrailReserveTargetYears: node("1.5"),
    retireGuardrailEmergencyLabel: node(), retireGuardrailOutput: node(),
  };
  const utils = {
    formatMoney: (value) => `NT$ ${Math.round(Number(value)).toLocaleString("en-US")}`,
    escapeHTML: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  };

  renderRetirement({ state: sampleState(), utils, dom });

  assert.match(dom.retireScenarios.innerHTML, /<details class="review-comparison">/);
  assert.match(dom.retireScenarios.innerHTML, /延後 3 年退休/);
  assert.match(dom.retireScenarios.innerHTML, /每月提領減少 10%/);
  assert.match(dom.retireScenarios.innerHTML, /不是投資建議、承諾或保證/);
  assert.match(dom.retireGuardrailOutput.innerHTML, /目前提領率/);
  assert.match(dom.retireGuardrailOutput.innerHTML, /本次提領來源順序/);
  assert.match(dom.retireGuardrailOutput.innerHTML, /使用投資組合內現金/);
  assert.match(dom.retireGuardrailOutput.innerHTML, /依期初配置與上年度資產報酬推估目前配置/);
  assert.match(dom.retireGuardrailOutput.innerHTML, /不會修改帳戶、建立交易或保證資金安全/);
  assert.match(dom.retireGuardrailEmergencyLabel.textContent, /目前可辨識緊急預備金/);

  dom.retireGuardrailStockReturn.value = "20";
  dom.retireGuardrailBondReturn.value = "0";
  dom.retireGuardrailPortfolioReturn.value = "12";
  renderRetirement({ state: sampleState(), utils, dom });
  assert.match(dom.retireGuardrailOutput.innerHTML, /股票 64\.3%（超配 4\.3%）/);
  assert.match(dom.retireGuardrailOutput.innerHTML, /賣出上漲且超過目標配置的股票/);
});
