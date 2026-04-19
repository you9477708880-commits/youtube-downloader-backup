import { calculateRetirementProjection } from "../domain/retirement.js";

export function renderRetirement({ state, utils, dom }) {
  const currentAge = parseInt(dom.currentAge.value, 10) || 30;
  const retirementAge = parseInt(dom.retirementAge.value, 10) || 65;
  const deathAge = parseInt(dom.deathAge.value, 10) || 90;

  const projection = calculateRetirementProjection({
    state,
    currentAge,
    retirementAge,
    deathAge,
    inputs: {
      currentAsset: parseFloat(dom.retireAsset.value) || 0,
      monthlyContribution: parseFloat(dom.retireMonthly.value) || 0,
      principalAnnualReturnRate: parseFloat(dom.retirePrincipalReturn.value) || 6,
      contributionAnnualReturnRate: parseFloat(dom.retireContributionReturn.value) || 6,
      inflationRate: parseFloat(dom.retireInflation.value) || 2,
      monthlyWithdraw: parseFloat(dom.retireWithdraw.value) || 40000,
      targetAsset: parseFloat(dom.retireTarget.value) || 20000000,
    },
  });

  dom.retireLinkedValue.textContent = `可連動資產：${utils.formatMoney(projection.retirementReadyAsset)}`;

  if (state.settings.retLinked) {
    dom.retireAsset.value = projection.principal;
    dom.retireAssetValue.textContent = utils.formatMoney(projection.principal);
  }

  const setMetric = (node, text, ok) => {
    node.textContent = text;
    node.className = `vl text-md ${ok === true ? "text-inc" : ok === false ? "text-exp" : ""}`;
  };

  setMetric(dom.retireAssetAtRetire, utils.formatMoney(projection.retirementValue), projection.achievement >= 100);
  setMetric(dom.retireAchieve, `${projection.achievement.toFixed(1)}%`, projection.achievement >= 100);
  setMetric(dom.retirePaid, projection.retirementRow ? utils.formatMoney(projection.retirementRow.paid) : "NT$ 0");
  setMetric(dom.retireGain, utils.formatMoney(projection.gain));

  if (projection.achievement >= 100) {
    const multiplier = projection.retirementRow?.paid > 0 ? projection.retirementValue / projection.retirementRow.paid : 1;
    dom.retireSuggestion.innerHTML = `<span class="bdg bdg-g">目標已達成</span> 投入資產放大 ${multiplier.toFixed(2)}x`;
  } else {
    const gap = projection.targetAsset - projection.retirementValue;
    const yearsLeft = Math.max(1, retirementAge - currentAge);
    const monthlyRealRate = ((1 + projection.contributionAnnualReturn) / (1 + projection.inflation) - 1) / 12;
    const periods = yearsLeft * 12;
    const requiredMonthly =
      monthlyRealRate > 0 && periods > 0
        ? (gap * monthlyRealRate) / (Math.pow(1 + monthlyRealRate, periods) - 1)
        : gap / periods;
    dom.retireSuggestion.innerHTML = `<span class="bdg bdg-r">目標有缺口</span> 尚差 ${utils.formatMoney(gap)}，建議每月加碼 <strong class="text-dark">${utils.formatMoney(Math.max(0, requiredMonthly))}</strong>`;
  }

  dom.retireTable.innerHTML = projection.table
    .map((row) => `
      <tr class="${row.age === retirementAge ? "bg-inc-light" : ""}">
        <td class="${row.age === retirementAge ? "text-inc font-bold" : ""}">${row.age}歲</td>
        <td class="text-xs ${row.retired ? "text-exp" : "text-inc"}">${row.retired ? "退休後" : "累積中"}</td>
        <td class="r text-gray font-mono">${utils.formatMoney(row.paid)}</td>
        <td class="r font-mono ${row.age === retirementAge ? "font-bold" : ""}">${utils.formatMoney(row.balance)}</td>
      </tr>
    `)
    .join("");
}
