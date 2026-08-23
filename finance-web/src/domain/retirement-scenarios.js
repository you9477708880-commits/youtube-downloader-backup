import { calculateRetirementProjection } from "./retirement.js";

export function calculateRetirementScenarios({ state, currentAge, retirementAge, deathAge, inputs }) {
  const baseline = calculateRetirementProjection({ state, currentAge, retirementAge, deathAge, inputs });
  const delayedRetirementAge = Math.min(retirementAge + 3, Math.max(retirementAge, deathAge - 1));
  const lowerWithdrawInputs = {
    ...inputs,
    monthlyWithdraw: inputs.monthlyWithdraw * 0.9,
  };

  return [
    {
      id: "baseline",
      label: "目前設定",
      description: `退休 ${retirementAge} 歲｜每月提領基準不變`,
      projection: baseline,
    },
    {
      id: "delay-three-years",
      label: "延後 3 年退休",
      description: delayedRetirementAge === retirementAge
        ? `預期壽命設定未留下可延後空間，仍以 ${retirementAge} 歲試算`
        : `退休改為 ${delayedRetirementAge} 歲｜其他設定不變`,
      projection: calculateRetirementProjection({
        state,
        currentAge,
        retirementAge: delayedRetirementAge,
        deathAge,
        inputs,
      }),
    },
    {
      id: "withdraw-ten-percent-less",
      label: "每月提領減少 10%",
      description: `每月提領改為 ${lowerWithdrawInputs.monthlyWithdraw}｜其他設定不變`,
      projection: calculateRetirementProjection({
        state,
        currentAge,
        retirementAge,
        deathAge,
        inputs: lowerWithdrawInputs,
      }),
    },
  ];
}
