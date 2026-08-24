import { calculateRetirementScenarios } from "../domain/retirement-scenarios.js";
import { calculateGuardrailDecision, calculateWithdrawalSourcePlan } from "../domain/retirement-guardrails.js";
import { toMoneyInt } from "../utils/format.js";

function parseNumberOrDefault(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatRate(rate) {
  return Number.isFinite(rate) ? `${(rate * 100).toFixed(2)}%` : "無法計算";
}

function guardrailActionMeta(action) {
  return {
    "reduce-ten-percent": { label: "降低 10%", badge: "bdg-r", explanation: "目前提領率超過上界，且資本保存規則仍在適用年齡內。" },
    "increase-ten-percent": { label: "提高 10%", badge: "bdg-g", explanation: "目前提領率低於下界，可依繁榮規則提高提領。" },
    "freeze-inflation": { label: "凍結通膨調整", badge: "bdg-a", explanation: "上年度組合報酬為負，且目前提領率高於起始提領率。" },
    "inflation-adjust": { label: "按通膨調整", badge: "bdg-g", explanation: "提領率仍在護欄內，且未觸發虧損年凍結條件。" },
  }[action];
}

export function renderRetirement({ state, utils, dom }) {
  const currentAge = parseInt(dom.currentAge.value, 10) || 30;
  const retirementAge = parseInt(dom.retirementAge.value, 10) || 65;
  const deathAge = parseInt(dom.deathAge.value, 10) || 90;

  const inputs = {
    currentAsset: toMoneyInt(dom.retireAsset.value),
    monthlyContribution: toMoneyInt(dom.retireMonthly.value),
    principalAnnualReturnRate: parseNumberOrDefault(dom.retirePrincipalReturn.value, 6),
    contributionAnnualReturnRate: parseNumberOrDefault(dom.retireContributionReturn.value, 6),
    inflationRate: parseNumberOrDefault(dom.retireInflation.value, 2),
    monthlyWithdraw: toMoneyInt(dom.retireWithdraw.value) || 40000,
    targetAsset: toMoneyInt(dom.retireTarget.value) || 20000000,
  };
  const scenarios = calculateRetirementScenarios({ state, currentAge, retirementAge, deathAge, inputs });
  const projection = scenarios[0].projection;

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

  const presetGuide = `
    <div class="text-xs text-gray mt-2">
      保守型：約股票 20% - 40% / 債券與現金 60% - 80%；平衡型：約股票 50% - 60% / 債券 40% - 50%；成長型：約股票 70% - 80% / 債券 20% - 30%；積極型：約股票 90% 上下 / 債券與現金 10%。
    </div>
  `;
  const safeWithdrawalTarget = projection.monthlyWithdraw * 300;
  const safeWithdrawalGuide = `
    <div class="text-xs text-gray mt-2">
      4% 法則參考：若希望每年提領約資產的 4%，目前每月提領 ${utils.formatMoney(projection.monthlyWithdraw)}，大約對應目標資產 ${utils.formatMoney(safeWithdrawalTarget)}。這是經驗法則參考值，不等同保證。
    </div>
  `;

  if (projection.achievement >= 100) {
    const multiplier = projection.retirementRow?.paid > 0 ? projection.retirementValue / projection.retirementRow.paid : 1;
    dom.retireSuggestion.innerHTML = `<span class="bdg bdg-g">目標已達成</span> 投入資產放大 ${multiplier.toFixed(2)}x${presetGuide}${safeWithdrawalGuide}`;
  } else {
    const gap = projection.targetAsset - projection.retirementValue;
    const yearsLeft = Math.max(1, retirementAge - currentAge);
    const monthlyRealRate = ((1 + projection.contributionAnnualReturn) / (1 + projection.inflation) - 1) / 12;
    const periods = yearsLeft * 12;
    const requiredMonthly =
      monthlyRealRate > 0 && periods > 0
        ? (gap * monthlyRealRate) / (Math.pow(1 + monthlyRealRate, periods) - 1)
        : gap / periods;
    dom.retireSuggestion.innerHTML = `<span class="bdg bdg-r">目標有缺口</span> 尚差 ${utils.formatMoney(gap)}，建議每月加碼 <strong class="text-dark">${utils.formatMoney(Math.max(0, requiredMonthly))}</strong>${presetGuide}${safeWithdrawalGuide}`;
  }

  if (projection.targetTooLow) {
    dom.retireSuggestion.innerHTML += `<div class="text-xs text-exp mt-2">目前設定的目標資產 ${utils.formatMoney(projection.targetAsset)}，不足以支撐每月提領 ${utils.formatMoney(projection.monthlyWithdraw)} 到 ${deathAge} 歲。至少建議把目標資產提高到 ${utils.formatMoney(projection.minimumRequiredAsset)}。</div>`;
  }

  if (projection.depletedAgeLabel) {
    dom.retireSuggestion.innerHTML += `<div class="text-xs text-exp mt-1">依目前設定，退休後資產可能在 ${projection.depletedAgeLabel} 左右用完，建議調低每月提領、延後退休，或提高退休前累積資產。</div>`;
  }

  if (dom.retireScenarios) {
    dom.retireScenarios.innerHTML = `
      <details class="review-comparison">
        <summary>情境比較 <span class="text-xs text-gray">只改一個條件</span></summary>
        <div class="detail-list mt-2">
          ${scenarios.map((scenario) => `
            <div class="detail-row">
              <span class="detail-main">
                <span class="detail-title">${utils.escapeHTML(scenario.label)}</span>
                <span class="detail-sub">${utils.escapeHTML(scenario.description)}｜退休時資產 ${utils.formatMoney(scenario.projection.retirementValue)}｜最低需求估算 ${utils.formatMoney(scenario.projection.minimumRequiredAsset)}</span>
              </span>
              <span class="detail-amt">${utils.escapeHTML(scenario.projection.depletedAgeLabel || "規劃期內未耗盡")}</span>
            </div>
          `).join("")}
        </div>
        <div class="text-xs text-gray mt-2">這是敏感度比較：每次只改一個條件，其他設定維持不變。結果不是投資建議、承諾或保證。</div>
      </details>
    `;
  }

  if (dom.retireGuardrailOutput) {
    const portfolioValue = toMoneyInt(dom.retireGuardrailPortfolio.value);
    const priorAnnualWithdrawal = toMoneyInt(dom.retireGuardrailWithdrawal.value);
    const decision = calculateGuardrailDecision({
      portfolioValue,
      initialWithdrawalRatePct: parseNumberOrDefault(dom.retireGuardrailInitialRate.value, 5.3),
      priorAnnualWithdrawal,
      inflationRatePct: inputs.inflationRate,
      priorPortfolioReturnPct: parseNumberOrDefault(dom.retireGuardrailPortfolioReturn.value, 0),
      currentAge,
      maximumAge: deathAge,
    });
    const availableEmergencyReserve = Math.max(0, projection.emergencyFund);
    const sourcePlan = calculateWithdrawalSourcePlan({
      portfolioValue,
      currentAllocation: {
        stock: dom.retireGuardrailCurrentStock.value,
        bond: dom.retireGuardrailCurrentBond.value,
        cash: dom.retireGuardrailCurrentCash.value,
      },
      targetAllocation: {
        stock: dom.retireGuardrailTargetStock.value,
        bond: dom.retireGuardrailTargetBond.value,
        cash: dom.retireGuardrailTargetCash.value,
      },
      annualWithdrawal: decision.nextAnnualWithdrawal,
      priorStockReturnPct: dom.retireGuardrailStockReturn.value,
      priorBondReturnPct: dom.retireGuardrailBondReturn.value,
      emergencyReserve: availableEmergencyReserve,
      allowEmergencyReserve: dom.retireGuardrailUseEmergency.checked,
    });
    const reserveTargetYears = Math.max(0, parseNumberOrDefault(dom.retireGuardrailReserveTargetYears.value, 1.5));
    const reserveTargetAmount = decision.nextAnnualWithdrawal * reserveTargetYears;
    const reserveTargetGap = Math.max(0, reserveTargetAmount - availableEmergencyReserve);

    dom.retireGuardrailEmergencyLabel.textContent = `目前可辨識緊急預備金：${utils.formatMoney(availableEmergencyReserve)}`;

    if (!decision.valid) {
      dom.retireGuardrailOutput.innerHTML = `<div class="text-xs text-exp">請輸入大於 0 的投資組合市值、上年度全年提領與起始提領率。</div>`;
    } else if (!sourcePlan.valid) {
      dom.retireGuardrailOutput.innerHTML = `
        <div class="text-xs text-exp">目前配置合計 ${sourcePlan.currentTotal.toFixed(1)}%，目標配置合計 ${sourcePlan.targetTotal.toFixed(1)}%；兩者都必須各自等於 100%。</div>
      `;
    } else {
      const action = guardrailActionMeta(decision.action);
      const sourceRows = sourcePlan.steps.length
        ? sourcePlan.steps.map((step) => `
            <div class="detail-row">
              <span class="detail-main"><span class="detail-title">${utils.escapeHTML(step.label)}</span></span>
              <span class="detail-amt">${utils.formatMoney(step.amount)}</span>
            </div>
          `).join("")
        : `<div class="text-xs text-gray">本次沒有需要配置的提領金額。</div>`;
      const stockProtection = parseNumberOrDefault(dom.retireGuardrailStockReturn.value, 0) < 0
        ? sourcePlan.avoidedSellingDownStock
          ? `<div class="text-xs text-inc mt-2">股票為負報酬，本次現金、債券${sourcePlan.allowEmergencyReserve ? "與已允許的緊急預備金" : ""}足以支應，不必賣出下跌股票。</div>`
          : `<div class="text-xs text-exp mt-2">股票為負報酬，但其他來源不足，試算最後仍需賣出部分股票。</div>`
        : "";
      const unfunded = sourcePlan.remainingUnfunded > 0
        ? `<div class="text-xs text-exp mt-2">可用來源仍不足 ${utils.formatMoney(sourcePlan.remainingUnfunded)}；此工具不會自動創造資金或借款。</div>`
        : "";
      const preservationExpiry = !decision.capitalPreservationActive && decision.currentRate > decision.upperRate
        ? `<div class="text-xs text-gray mt-2">目前已進入預期壽命前 15 年，原論文的資本保存減碼規則不再強制套用；仍應自行評估支出與照護需求。</div>`
        : "";
      const preRetirementNote = currentAge < retirementAge
        ? `<div class="text-xs text-gray mt-2">目前年齡尚未到設定的退休年齡；以下是退休後年度檢查的預先演練。</div>`
        : "";
      const reserveTarget = reserveTargetYears > 0
        ? reserveTargetGap > 0
          ? `<div class="text-xs text-exp mt-2">以明年提領額估算，保留 ${reserveTargetYears.toFixed(1)} 年緊急預備金的目標是 ${utils.formatMoney(reserveTargetAmount)}，目前尚差 ${utils.formatMoney(reserveTargetGap)}。</div>`
          : `<div class="text-xs text-inc mt-2">目前緊急預備金已達 ${reserveTargetYears.toFixed(1)} 年目標（約 ${utils.formatMoney(reserveTargetAmount)}）。</div>`
        : `<div class="text-xs text-gray mt-2">目前未設定緊急預備金年數目標。</div>`;

      dom.retireGuardrailOutput.innerHTML = `
        <div class="detail-list">
          <div class="detail-row">
            <span class="detail-main"><span class="detail-title">目前提領率</span><span class="detail-sub">下界 ${formatRate(decision.lowerRate)}｜起始 ${formatRate(decision.initialRate)}｜上界 ${formatRate(decision.upperRate)}</span></span>
            <span class="detail-amt">${formatRate(decision.currentRate)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-main"><span class="detail-title"><span class="bdg ${action.badge}">${action.label}</span></span><span class="detail-sub">${utils.escapeHTML(action.explanation)}</span></span>
            <span class="detail-amt">每月 ${utils.formatMoney(decision.nextMonthlyWithdrawal)}</span>
          </div>
        </div>
        ${preRetirementNote}${preservationExpiry}
        <div class="text-xs text-gray mt-2">投資組合內現金可支應 ${sourcePlan.cashBufferYears.toFixed(2)} 年；${sourcePlan.allowEmergencyReserve ? `加上已允許的緊急預備金後約 ${sourcePlan.protectedBufferYears.toFixed(2)} 年。` : "緊急預備金預設不動用。"}</div>
        ${reserveTarget}
        <div class="ct mt-3">本次提領來源順序</div>
        <div class="detail-list">${sourceRows}</div>
        ${stockProtection}${unfunded}
        <div class="text-xs text-gray mt-2">來源順序依簡化的 Guyton-Klinger 投資組合管理規則：先處理上漲且超配的資產，再用現金、債券、經你允許的緊急預備金，最後才用股票。這是年度規劃試算，不會修改帳戶、建立交易或保證資金安全。</div>
        <div class="text-xs mt-2"><a href="https://www.financialplanningassociation.org/article/journal/MAR06-decision-rules-and-maximum-initial-withdrawal-rates" target="_blank" rel="noopener noreferrer">原始研究規則</a>｜<a href="https://potawang.substack.com/p/retirement-guardrail-strategy-vs-4-percent-rule" target="_blank" rel="noopener noreferrer">中文閱讀參考</a></div>
      `;
    }
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
