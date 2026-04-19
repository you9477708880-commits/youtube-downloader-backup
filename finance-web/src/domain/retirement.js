import { calculateAccountBalances } from "./accounts.js";

export function calculateRetirementProjection({ state, currentAge, retirementAge, deathAge, inputs }) {
  const balances = calculateAccountBalances(state);

  let totalWorth = 0;
  let emergencyFund = 0;

  state.accounts.forEach((account) => {
    totalWorth += balances[account.id];
    if (account.isEm) emergencyFund += balances[account.id];
  });

  state.bsI.forEach((item) => {
    const value = item.cat === "asset" ? item.amount : -item.amount;
    totalWorth += value;
    if (item.isEm) emergencyFund += value;
  });

  const retirementReadyAsset = totalWorth - emergencyFund;
  let principal = 0;

  if (state.settings.retLinked) {
    principal = Math.max(0, retirementReadyAsset);
  } else {
    principal = inputs.currentAsset || 0;
  }

  const monthlyContribution = inputs.monthlyContribution || 0;
  const principalAnnualReturn = (inputs.principalAnnualReturnRate || 0) / 100 || 0.06;
  const contributionAnnualReturn = (inputs.contributionAnnualReturnRate || 0) / 100 || 0.06;
  const inflation = (inputs.inflationRate || 0) / 100 || 0.02;
  const monthlyWithdraw = inputs.monthlyWithdraw || 40000;
  const targetAsset = inputs.targetAsset || 20000000;
  const principalMonthlyRate = principalAnnualReturn / 12;
  const contributionMonthlyRate = contributionAnnualReturn / 12;
  const table = [];
  let principalBalance = principal;
  let contributionBalance = 0;
  let paid = principal;

  for (let year = 0; year <= Math.max(0, Math.min(deathAge, 120) - currentAge); year += 1) {
    const age = currentAge + year;
    const retired = age >= retirementAge;

    if (!retired) {
      for (let month = 0; month < 12; month += 1) {
        principalBalance *= 1 + principalMonthlyRate;
        contributionBalance *= 1 + contributionMonthlyRate;
        contributionBalance += monthlyContribution;
        paid += monthlyContribution;
      }
    } else {
      const adjustedWithdraw = monthlyWithdraw * Math.pow(1 + inflation, year);
      for (let month = 0; month < 12; month += 1) {
        const totalBalance = principalBalance + contributionBalance;
        const cappedWithdraw = Math.min(adjustedWithdraw, totalBalance);

        if (cappedWithdraw > 0 && totalBalance > 0) {
          const principalShare = principalBalance / totalBalance;
          const contributionShare = contributionBalance / totalBalance;
          principalBalance = Math.max(0, principalBalance - cappedWithdraw * principalShare);
          contributionBalance = Math.max(0, contributionBalance - cappedWithdraw * contributionShare);
        }

        principalBalance *= 1 + principalMonthlyRate;
        contributionBalance *= 1 + contributionMonthlyRate;
      }
    }

    const discountFactor = 1 / Math.pow(1 + inflation, year);
    const totalBalance = principalBalance + contributionBalance;
    table.push({
      age,
      retired,
      balance: totalBalance * discountFactor,
      paid: paid * discountFactor,
    });
  }

  const retirementRow = table.find((row) => row.age === retirementAge) || table[table.length - 1];
  const retirementValue = retirementRow ? retirementRow.balance : 0;
  const achievement = targetAsset > 0 ? (retirementValue / targetAsset) * 100 : 100;
  const gain = Math.max(0, retirementValue - (retirementRow ? retirementRow.paid : 0));

  return {
    retirementReadyAsset,
    principal,
    table,
    retirementRow,
    retirementValue,
    achievement,
    gain,
    targetAsset,
    principalAnnualReturn,
    contributionAnnualReturn,
    inflation,
    monthlyContribution,
    monthlyWithdraw,
  };
}
