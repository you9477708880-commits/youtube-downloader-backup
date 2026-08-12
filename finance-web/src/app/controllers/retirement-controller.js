export function createRetirementController({
  elements,
  store,
  commitState,
  renderAll,
  formatMoney,
  toMoneyInt,
}) {
  const {
    linked,
    manualWrap,
    currentAge,
    retirementAge,
    deathAge,
    asset,
    monthly,
    principalReturn,
    contributionReturn,
    inflation,
    withdraw,
    target,
    assetValue,
    monthlyValue,
    principalReturnValue,
    contributionReturnValue,
    inflationValue,
    withdrawValue,
    targetValue,
    tableWrap,
    tableToggleLabel,
  } = elements;

  const inputDefinitions = {
    retireAsset: [assetValue, (value) => formatMoney(toMoneyInt(value))],
    retireMonthly: [monthlyValue, (value) => formatMoney(toMoneyInt(value))],
    retirePrincipalReturn: [principalReturnValue, (value) => `${parseFloat(value).toFixed(1)}%`],
    retireContributionReturn: [contributionReturnValue, (value) => `${parseFloat(value).toFixed(1)}%`],
    retireInflation: [inflationValue, (value) => `${parseFloat(value).toFixed(1)}%`],
    retireWithdraw: [withdrawValue, (value) => formatMoney(toMoneyInt(value))],
    retireTarget: [targetValue, (value) => formatMoney(toMoneyInt(value))],
  };

  const inputElements = {
    retireAsset: asset,
    retireMonthly: monthly,
    retirePrincipalReturn: principalReturn,
    retireContributionReturn: contributionReturn,
    retireInflation: inflation,
    retireWithdraw: withdraw,
    retireTarget: target,
  };

  const toggleLinkedUi = () => {
    const isLinked = store.getState().settings.retLinked;
    manualWrap.classList.toggle("opacity-50", isLinked);
    manualWrap.classList.toggle("pointer-none", isLinked);
    asset.disabled = isLinked;
  };

  const syncInputValues = () => {
    Object.entries(inputDefinitions).forEach(([inputKey, [output, formatter]]) => {
      output.textContent = formatter(inputElements[inputKey].value || 0);
    });
  };

  const syncFromSettings = () => {
    const state = store.getState();
    linked.checked = state.settings.retLinked;
    asset.value = state.settings.retManualAsset;
    toggleLinkedUi();
    syncInputValues();
  };

  const updateLinked = () => {
    commitState((state) => {
      state.settings.retLinked = linked.checked;
    }, {
      updateUi: () => {
        toggleLinkedUi();
        renderAll();
      },
    });
  };

  const updateAge = () => renderAll();

  const updateInput = (inputKey, event) => {
    const [output, formatter] = inputDefinitions[inputKey];
    output.textContent = formatter(event.target.value);
    if (inputKey === "retireAsset" && !store.getState().settings.retLinked) {
      commitState((state) => {
        state.settings.retManualAsset = toMoneyInt(event.target.value);
      }, { updateUi: renderAll });
      return;
    }
    renderAll();
  };

  const presetRet = (returnRate, inflationRate) => {
    principalReturn.value = returnRate;
    principalReturnValue.textContent = `${returnRate.toFixed(1)}%`;
    contributionReturn.value = returnRate;
    contributionReturnValue.textContent = `${returnRate.toFixed(1)}%`;
    inflation.value = inflationRate;
    inflationValue.textContent = `${inflationRate.toFixed(1)}%`;
    renderAll();
  };

  const toggleTable = () => {
    tableWrap.classList.toggle("d-none");
    tableToggleLabel.textContent = tableWrap.classList.contains("d-none") ? "展開 ▼" : "收合 ▲";
  };

  const reset = () => {};

  return {
    syncFromSettings,
    updateLinked,
    updateAge,
    updateInput,
    presetRet,
    toggleTable,
    reset,
  };
}
