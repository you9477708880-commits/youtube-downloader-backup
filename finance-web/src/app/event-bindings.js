const DATA_ACTIONS = {
  tab: ({ button, actions }) => actions.switchTab(button.dataset.target),
  "set-tx-type": ({ button, actions }) => actions.setTxType(button.dataset.val),
  "add-custom-cat": ({ actions }) => actions.addCustomCat(),
  "add-fund-cat": ({ actions }) => actions.addFundCategory(),
  "edit-tx": ({ button, actions }) => actions.beginEditTx(button.dataset.id),
  "edit-repayment": ({ button, actions }) => actions.editAdvanceRepayment(button.dataset.id),
  "del-tx": ({ button, actions }) => actions.delTx(button.dataset.id),
  "repay-advance": ({ button, actions }) => actions.repayAdvance(button.dataset.id),
  "edit-bs": ({ button, actions }) => actions.beginEditBs(button.dataset.id, button.dataset.isacc === "true"),
  "del-bs": ({ button, actions }) => actions.delBs(button.dataset.id, button.dataset.isacc === "true"),
  "toggle-em": ({ button, actions }) => actions.toggleEm(button.dataset.id, button.dataset.isacc === "true"),
  "del-cat-budget": ({ button, actions }) => actions.delCatBudget(button.dataset.cat),
  "cleanup-cat-budgets": ({ actions }) => actions.cleanupCatBudgets(),
  "edit-wish": ({ button, actions }) => actions.beginEditWish(button.dataset.id),
  "prepare-fund-from-wish": ({ button, actions }) => actions.prepareFundFromWish(button.dataset.id),
  "del-wish": ({ button, actions }) => actions.delWish(button.dataset.id),
  "mv-wish": ({ button, actions }) => actions.mvWish(button.dataset.id, Number(button.dataset.dir)),
  "toggle-tbl": ({ handlers }) => handlers.toggleRetirementTable(),
  "preset-ret": ({ button, actions }) => actions.presetRet(Number(button.dataset.r), Number(button.dataset.i)),
  "del-fund": ({ button, actions }) => actions.delFund(button.dataset.id),
  "edit-fund": ({ button, actions }) => actions.beginEditFund(button.dataset.id),
  "topup-fund": ({ button, actions }) => actions.topupFund(button.dataset.id),
  "open-fund": ({ button, actions }) => actions.openFund(button.dataset.id),
  "view-tx": ({ button, actions }) => actions.openTransactionDetail(button.dataset.id, button),
  "view-budget-source": ({ button, actions }) => actions.openBudgetSourceDetail(button.dataset.id, button.dataset.sourceType, button),
  "edit-transaction-detail": ({ actions }) => actions.editTransactionDetail(),
  "delete-transaction-detail": ({ actions }) => actions.deleteTransactionDetail(),
  "cancel-transaction-detail-edit": ({ actions }) => actions.cancelTransactionDetailEdit(),
  "save-transaction-detail": ({ actions }) => { void actions.saveTransactionDetail(); },
  "close-transaction-detail": ({ actions }) => actions.closeTransactionDetail(),
  "filter-goals": ({ button, handlers }) => handlers.filterGoalCenter(button.dataset.filter),
  "export-data": ({ handlers }) => handlers.exportData(),
  "trigger-import": ({ handlers }) => handlers.triggerImport(),
  "export-andromoney": ({ handlers }) => handlers.exportAndroMoney(),
  "trigger-andromoney-import": ({ handlers }) => handlers.triggerAndroMoneyImport(),
  "open-recovery-center": ({ handlers }) => { void handlers.openRecoveryCenter(); },
  "close-recovery-center": ({ handlers }) => handlers.closeRecoveryCenter(),
  "restore-recovery": ({ button, handlers }) => { void handlers.restoreRecovery(button.dataset.id); },
  "export-recovery": ({ button, handlers }) => { void handlers.exportRecovery(button.dataset.id); },
  "delete-recovery": ({ button, handlers }) => { void handlers.deleteRecovery(button.dataset.id); },
  "open-device-clear": ({ handlers }) => { void handlers.openDeviceClear(); },
  "close-device-clear": ({ handlers }) => handlers.closeDeviceClear(),
  "backup-before-device-clear": ({ handlers }) => handlers.backupBeforeDeviceClear(),
  "confirm-device-clear": ({ handlers }) => handlers.confirmDeviceClear(),
  "reconcile-account": ({ button, handlers }) => handlers.reconcileAccount(button.dataset.id),
  "view-life-routine": ({ button, actions }) => actions.viewLifeRoutine(button.dataset.id),
  "edit-life-routine": ({ button, actions }) => actions.beginEditLifeRoutine(button.dataset.id),
  "toggle-life-routine": ({ button, actions }) => actions.toggleLifeRoutine(button.dataset.id),
  "delete-life-routine": ({ button, actions }) => actions.deleteLifeRoutine(button.dataset.id),
};

export function dispatchDataAction({ button, actions, ui, handlers }) {
  const dispatch = DATA_ACTIONS[button?.dataset?.action];
  if (!dispatch) return false;
  dispatch({ button, actions, ui, handlers });
  return true;
}

export function bindAppEvents({ doc, win = window, dom, actions, ui, handlers }) {
  if (!doc?.body || !dom || !actions || !ui || !handlers) {
    throw new Error("event-bindings-dependencies-required");
  }

  const removers = [];
  const on = (target, type, listener) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  };

  on(doc.body, "click", (event) => {
    const button = event.target?.closest?.("[data-action]");
    if (button) dispatchDataAction({ button, actions, ui, handlers });
  });

  on(doc, "keydown", (event) => {
    if (event.key === "Escape") actions.closeTransactionDetail();
    if (event.key === "Escape") handlers.closeRecoveryCenter();
    if (event.key === "Escape") handlers.closeDeviceClear();
    if (event.key === "Tab") actions.trapTransactionDetailFocus(event);
  });

  on(dom.transactionDetailModal, "click", (event) => {
    if (event.target === dom.transactionDetailModal) actions.closeTransactionDetail();
  });

  on(dom.transactionDetailModal, "change", (event) => {
    if (event.target?.id === "transaction-detail-type") actions.syncTransactionDetailType();
  });

  on(dom.recoveryCenterModal, "click", (event) => {
    if (event.target === dom.recoveryCenterModal) handlers.closeRecoveryCenter();
  });

  on(dom.deviceClearModal, "click", (event) => {
    if (event.target === dom.deviceClearModal) handlers.closeDeviceClear();
  });

  on(dom.androMoneyAccounts, "change", (event) => {
    if (event.target?.matches?.("[data-andromoney-account]")) {
      handlers.syncAndroMoneyAccountChoice(event.target);
    }
  });

  const bindForm = (id, callback) => {
    const form = doc.getElementById(id);
    on(form, "submit", (event) => {
      event.preventDefault();
      if (form.checkValidity()) callback();
      else form.reportValidity();
    });
  };

  bindForm("form-tx", actions.addTx);
  bindForm("form-cat-bud", actions.setCatBudget);
  bindForm("form-wish", actions.addWish);
  bindForm("form-bs", actions.addBs);
  bindForm("form-fund", actions.addFund);
  bindForm("form-life-routine", actions.saveLifeRoutine);

  on(dom.filterPreset, "change", (event) => actions.setDatePreset(event.target.value));
  on(dom.filterStart, "change", () => actions.customDate());
  on(dom.filterEnd, "change", () => actions.customDate());
  on(dom.transactionSearchQuery, "input", handlers.searchTransactions);
  on(dom.transactionSearchPreset, "change", handlers.changeTransactionSearchPeriod);
  on(dom.transactionSearchStart, "change", handlers.changeTransactionSearchPeriod);
  on(dom.transactionSearchEnd, "change", handlers.changeTransactionSearchPeriod);
  on(dom.transactionSearchClear, "click", handlers.clearTransactionSearch);
  on(dom.inputCategory, "change", () => ui.populateTransactionSubcategoryOptions({ reset: true }));
  on(dom.balanceType, "change", (event) => handlers.changeBalanceType(event.target.value, event));
  on(dom.balanceAccountType, "change", (event) => handlers.changeBalanceType(event.target.value, event));

  on(dom.txCancelButton, "click", actions.cancelEditTx);
  on(dom.fundCancelButton, "click", actions.cancelEditFund);
  on(dom.bsCancelButton, "click", actions.cancelEditBs);
  on(dom.wishCancelButton, "click", actions.cancelEditWish);
  on(dom.lifeReminderCancel, "click", actions.cancelEditLifeRoutine);
  on(dom.androMoneyCancel, "click", handlers.cancelAndroMoneyImport);
  on(dom.androMoneyConfirm, "click", handlers.confirmAndroMoneyImport);

  [
    dom.inputAmount,
    dom.inputOwnAmount,
    dom.budgetCapInput,
    dom.fundTarget,
    dom.fundMonthly,
    dom.balanceAmount,
    dom.catBudgetAmount,
    dom.wishPrice,
  ].forEach((node) => on(node, "change", (event) => handlers.normalizeMoneyInput(node, event)));

  on(dom.budgetCapInput, "change", handlers.updateBudgetCap);
  on(dom.retireLinked, "change", handlers.updateRetirementLinked);
  on(dom.retireGuardrailPanel, "input", handlers.updateRetirementGuardrail);
  on(dom.authButton, "click", handlers.runAuthAction);
  on(dom.cloudStatus, "click", handlers.retryCloudSync);

  ["currentAge", "retirementAge", "deathAge"].forEach((key) => {
    on(dom[key], "input", (event) => handlers.updateRetirementAge(key, event));
  });

  [
    "retireAsset",
    "retireMonthly",
    "retirePrincipalReturn",
    "retireContributionReturn",
    "retireInflation",
    "retireWithdraw",
    "retireTarget",
  ].forEach((key) => {
    on(dom[key], "input", (event) => handlers.updateRetirementInput(key, event));
  });

  on(dom.fileImport, "change", handlers.importJsonFile);
  on(dom.fileAndroMoneyImport, "change", handlers.importAndroMoneyFile);
  on(win, "online", (event) => handlers.updateConnectivity("online", event));
  on(win, "offline", (event) => handlers.updateConnectivity("offline", event));

  let active = true;
  return function unbind() {
    if (!active) return;
    active = false;
    removers.splice(0).reverse().forEach((remove) => remove());
  };
}
