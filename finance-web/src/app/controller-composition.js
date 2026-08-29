import { createDeviceDataClearService } from "../services/device-data-clear.js";
import { buildAndroMoneyCsv, parseAndroMoneyCsv } from "../services/andromoney-csv.js";
import { exportData, importData } from "../services/import-export.js";
import { downloadTextFile, readFileAsText } from "../services/browser-files.js";
import { LOCAL_STORAGE_SCOPE } from "../services/storage-local.js";
import { escapeHTML, formatMoney, localDateStr, toMoneyInt } from "../utils/format.js";
import { createActions } from "./actions.js";
import { createWholeStateReplacer } from "./controller-lifecycle.js";
import { createAccountCenterController } from "./controllers/account-center-controller.js";
import { createBalanceSheetController } from "./controllers/balance-sheet-controller.js";
import { createCategoryBudgetController } from "./controllers/category-budget-controller.js";
import { createDeviceDataController } from "./controllers/device-data-controller.js";
import { createImportController } from "./controllers/import-controller.js";
import { createLifeRecordReminderController } from "./controllers/life-record-reminder-controller.js";
import { createRecoveryCenterController } from "./controllers/recovery-center-controller.js";
import { createRetirementController } from "./controllers/retirement-controller.js";
import { createSinkingFundController } from "./controllers/sinking-fund-controller.js";
import { createTransactionController } from "./controllers/transaction-controller.js";
import { createTransactionDetailController } from "./controllers/transaction-detail-controller.js";
import { createTransactionSearchController } from "./controllers/transaction-search-controller.js";
import { createWishlistController } from "./controllers/wishlist-controller.js";

export function createControllerComposition({
  dom,
  store,
  ui,
  toast,
  commitState,
  renderCoordinator,
  constants,
  utils,
  syncCoordinator,
  conflictRecoveryStore,
  getCloudSync,
  saveState,
  enqueueCloudState,
  getFilteredTransactions,
  win = globalThis.window,
}) {
  const renderAll = renderCoordinator.renderAll;
  const renderBudgetOnly = renderCoordinator.renderBudgetOnly;
  const refreshWholeStateUi = renderCoordinator.refreshWholeStateUi;
  const baseActions = createActions({
    dom,
    store,
    ui,
    constants,
    commitState,
    renderAll,
    renderWishlist: renderBudgetOnly,
  });
  const navigate = (tabId) => baseActions.switchTab(tabId);
  let replaceWholeState = null;

  const balanceSheetController = createBalanceSheetController({
    elements: {
      root: dom.root,
      name: dom.balanceName,
      type: dom.balanceType,
      categoryWrap: dom.balanceCategoryWrap,
      category: dom.balanceCategory,
      accountFields: dom.balanceAccountFields,
      accountType: dom.balanceAccountType,
      creditFields: dom.balanceCreditFields,
      creditLimit: dom.balanceCreditLimit,
      statementDay: dom.balanceStatementDay,
      paymentDueDay: dom.balancePaymentDueDay,
      amount: dom.balanceAmount,
      emergency: dom.balanceEmergency,
    },
    store,
    toast,
    setEditMode: (value) => ui.setBalanceSheetEditMode(value),
    commitState,
    renderAll,
    navigate,
    confirmDelete: (message) => win.confirm(message),
  });
  const accountCenterController = createAccountCenterController({
    root: dom.root,
    store,
    toast,
    commitState,
    renderAll,
    localDateStr,
    confirmAdjustment: (message) => win.confirm(message),
  });
  const wishlistController = createWishlistController({
    elements: { root: dom.root, name: dom.wishName, price: dom.wishPrice, category: dom.wishCategory },
    store,
    toast,
    setEditMode: (value) => ui.setWishEditMode(value),
    commitState,
    renderWishlist: renderBudgetOnly,
    navigate,
  });
  const categoryBudgetController = createCategoryBudgetController({
    elements: {
      category: dom.catBudgetCategory,
      amount: dom.catBudgetAmount,
      budgetCap: dom.budgetCapInput,
      fundCategory: dom.fundCategory,
    },
    store,
    toast,
    commitState,
    renderBudget: renderBudgetOnly,
    populateOptions: () => ui.populateCategoryBudgetOptions(),
    constants,
    promptInput: (message) => win.prompt(message),
    confirmCleanup: (message) => win.confirm(message),
  });
  const sinkingFundController = createSinkingFundController({
    elements: {
      root: dom.root,
      name: dom.fundName,
      category: dom.fundCategory,
      target: dom.fundTarget,
      monthly: dom.fundMonthly,
      start: dom.fundStart,
      targetMonth: dom.fundTargetMonth,
      note: dom.fundNote,
      carry: dom.fundCarry,
    },
    store,
    toast,
    setEditMode: (value) => ui.setFundEditMode(value),
    commitState,
    renderWishlist: renderBudgetOnly,
    navigate,
    populateFundOptions: () => ui.populateFundOptions(),
    confirmAction: (message) => win.confirm(message),
    promptInput: (message, defaultValue) => win.prompt(message, defaultValue),
  });
  const transactionController = createTransactionController({
    elements: {
      root: dom.root,
      amount: dom.inputAmount,
      ownAmount: dom.inputOwnAmount,
      advancePerson: dom.inputAdvancePerson,
      fund: dom.inputFund,
      subcategory: dom.inputSubcategory,
      description: dom.inputDesc,
      date: dom.inputDate,
      category: dom.inputCategory,
      account: dom.inputAccount,
      fromAccount: dom.inputFromAccount,
      toAccount: dom.inputToAccount,
    },
    store,
    toast,
    setEditMode: (value) => ui.setTransactionEditMode(value),
    commitState,
    renderAll,
    navigate,
    syncTxType: () => ui.syncTxType(),
    renderTransactionCategorySelect: (options) => ui.renderTransactionCategorySelect(options),
    populateTransactionSubcategoryOptions: (options) => ui.populateTransactionSubcategoryOptions(options),
    populateFundOptions: () => ui.populateFundOptions(),
    populateCategoryBudgetOptions: () => ui.populateCategoryBudgetOptions(),
    askFundShortfallChoice: (details) => ui.askFundShortfallChoice(details),
    constants,
    confirmDelete: (message) => win.confirm(message),
    promptInput: (message, defaultValue) => win.prompt(message, defaultValue),
  });
  const transactionSearchController = createTransactionSearchController({
    elements: {
      query: dom.transactionSearchQuery,
      preset: dom.transactionSearchPreset,
      start: dom.transactionSearchStart,
      end: dom.transactionSearchEnd,
      clear: dom.transactionSearchClear,
      customRange: dom.transactionSearchCustom,
      status: dom.transactionSearchStatus,
      summary: dom.transactionSearchSummary,
      empty: dom.transactionSearchEmpty,
    },
    store,
    getReportTransactions: getFilteredTransactions,
    renderTransactions: renderCoordinator.renderLedgerTransactions,
  });
  const lifeRecordReminderController = createLifeRecordReminderController({
    elements: {
      panel: dom.lifeReminderPanel,
      heading: dom.lifeReminderHeading,
      query: dom.transactionSearchQuery,
      name: dom.lifeReminderName,
      interval: dom.lifeReminderInterval,
      dueSoon: dom.lifeReminderDueSoon,
      save: dom.lifeReminderSave,
      cancel: dom.lifeReminderCancel,
      list: dom.lifeRoutineList,
    },
    store,
    commitState,
    toast,
    renderSearch: () => transactionSearchController.render(),
  });
  const transactionDetailController = createTransactionDetailController({
    elements: {
      modal: dom.transactionDetailModal,
      title: dom.transactionDetailTitle,
      body: dom.transactionDetailBody,
      delete: dom.transactionDetailDelete,
      edit: dom.transactionDetailEdit,
      close: dom.transactionDetailClose,
    },
    store,
    formatMoney,
    escapeHTML,
    updateTransaction: (id, input) => transactionController.updateTransactionFromDetail(id, input),
    deleteTransaction: (id) => transactionController.delTx(id),
  });
  const importController = createImportController({
    elements: {
      androMoneyModal: dom.androMoneyModal,
      androMoneySummary: dom.androMoneySummary,
      androMoneyAccounts: dom.androMoneyAccounts,
      androMoneyDuplicates: dom.androMoneyDuplicates,
      androMoneyDuplicateMode: dom.androMoneyDuplicateMode,
      androMoneyPreview: dom.androMoneyPreview,
      androMoneyConfirm: dom.androMoneyConfirm,
    },
    store,
    toast,
    replaceWholeState: (state) => replaceWholeState(state),
    persistWholeState: saveState,
    refreshWholeStateUi,
    commitState,
    waitForCloudSave: enqueueCloudState,
    refreshTransactionUi: renderAll,
    readBackupFile: importData,
    exportBackupFile: exportData,
    readTextFile: readFileAsText,
    parseAndroMoneyCsv,
    buildAndroMoneyCsv,
    downloadTextFile,
    formatMoney,
    escapeHTML,
  });
  const recoveryCenterController = createRecoveryCenterController({
    elements: {
      modal: dom.recoveryCenterModal,
      summary: dom.recoveryCenterSummary,
      list: dom.recoveryCenterList,
      empty: dom.recoveryCenterEmpty,
      close: dom.recoveryCenterClose,
    },
    store,
    recoveryStore: conflictRecoveryStore,
    getScope: () => syncCoordinator.getLocalScope(),
    commitState,
    refreshWholeStateUi,
    exportBackupFile: exportData,
    toast,
    escapeHTML,
  });
  const deviceDataController = createDeviceDataController({
    elements: {
      modal: dom.deviceClearModal,
      title: dom.deviceClearTitle,
      summary: dom.deviceClearSummary,
      notice: dom.deviceClearNotice,
      unsyncedWrap: dom.deviceClearUnsyncedWrap,
      unsyncedAck: dom.deviceClearUnsyncedAck,
      confirm: dom.deviceClearConfirm,
      cancel: dom.deviceClearCancel,
      backup: dom.deviceClearBackup,
    },
    createService: () => createDeviceDataClearService({ recoveryStore: conflictRecoveryStore, cloudSync: getCloudSync() }),
    getTarget: () => {
      const scope = syncCoordinator.getLocalScope();
      if (!scope) throw new Error("device-clear-scope-unavailable");
      const currentUser = syncCoordinator.getCurrentUser();
      const uid = scope.startsWith("uid:") && currentUser && !currentUser.isAnonymous
        ? String(currentUser.uid || "")
        : "";
      return { scope: uid ? `uid:${uid}` : LOCAL_STORAGE_SCOPE, uid };
    },
    exportBackup: () => importController.exportBackup(),
    toast,
    reload: () => win.location.reload(),
  });
  const retirementController = createRetirementController({
    elements: {
      linked: dom.retireLinked,
      manualWrap: dom.retireManualWrap,
      currentAge: dom.currentAge,
      retirementAge: dom.retirementAge,
      deathAge: dom.deathAge,
      asset: dom.retireAsset,
      monthly: dom.retireMonthly,
      principalReturn: dom.retirePrincipalReturn,
      contributionReturn: dom.retireContributionReturn,
      inflation: dom.retireInflation,
      withdraw: dom.retireWithdraw,
      target: dom.retireTarget,
      assetValue: dom.retireAssetValue,
      monthlyValue: dom.retireMonthlyValue,
      principalReturnValue: dom.retirePrincipalReturnValue,
      contributionReturnValue: dom.retireContributionReturnValue,
      inflationValue: dom.retireInflationValue,
      withdrawValue: dom.retireWithdrawValue,
      targetValue: dom.retireTargetValue,
      tableWrap: dom.tableWrap,
      tableToggleLabel: dom.tableToggleLabel,
    },
    store,
    commitState,
    renderAll,
    formatMoney,
    toMoneyInt,
  });

  const resettableControllers = [
    balanceSheetController,
    accountCenterController,
    wishlistController,
    categoryBudgetController,
    sinkingFundController,
    transactionController,
    transactionSearchController,
    lifeRecordReminderController,
    transactionDetailController,
    importController,
    recoveryCenterController,
    retirementController,
  ];
  replaceWholeState = createWholeStateReplacer({ store, controllers: resettableControllers });
  syncCoordinator.bindWholeStateReplacer(replaceWholeState);
  renderCoordinator.bindFeatureControllers({
    transactionSearch: transactionSearchController,
    lifeRecordReminder: lifeRecordReminderController,
  });

  const actions = {
    ...baseActions,
    addBs: balanceSheetController.addBs,
    beginEditBs: balanceSheetController.beginEditBs,
    cancelEditBs: balanceSheetController.cancelEditBs,
    delBs: balanceSheetController.delBs,
    toggleEm: balanceSheetController.toggleEm,
    addWish: wishlistController.addWish,
    beginEditWish: wishlistController.beginEditWish,
    cancelEditWish: wishlistController.cancelEditWish,
    delWish: wishlistController.delWish,
    mvWish: wishlistController.mvWish,
    addFundCategory: categoryBudgetController.addFundCategory,
    setCatBudget: categoryBudgetController.setCatBudget,
    delCatBudget: categoryBudgetController.delCatBudget,
    cleanupCatBudgets: categoryBudgetController.cleanupCatBudgets,
    addFund: sinkingFundController.addFund,
    beginEditFund: sinkingFundController.beginEditFund,
    cancelEditFund: sinkingFundController.cancelEditFund,
    delFund: sinkingFundController.delFund,
    topupFund: sinkingFundController.topupFund,
    openFund: sinkingFundController.openFund,
    prepareFundFromWish: sinkingFundController.prepareFundFromWish,
    setTxType: transactionController.setTxType,
    addCustomCat: transactionController.addCustomCat,
    addTx: transactionController.addTx,
    beginEditTx: transactionController.beginEditTx,
    cancelEditTx: transactionController.cancelEditTx,
    delTx: transactionController.delTx,
    repayAdvance: transactionController.repayAdvance,
    editAdvanceRepayment: transactionController.editAdvanceRepayment,
    presetRet: retirementController.presetRet,
    openTransactionDetail: transactionDetailController.openTransaction,
    openBudgetSourceDetail: transactionDetailController.openBudgetSource,
    editTransactionDetail: transactionDetailController.startEdit,
    deleteTransactionDetail: transactionDetailController.removeActiveTransaction,
    cancelTransactionDetailEdit: transactionDetailController.cancelEdit,
    saveTransactionDetail: transactionDetailController.saveEdit,
    syncTransactionDetailType: transactionDetailController.syncEditorType,
    closeTransactionDetail: transactionDetailController.close,
    trapTransactionDetailFocus: transactionDetailController.trapFocus,
    saveLifeRoutine: lifeRecordReminderController.save,
    beginEditLifeRoutine: lifeRecordReminderController.beginEdit,
    cancelEditLifeRoutine: lifeRecordReminderController.cancelEdit,
    deleteLifeRoutine: lifeRecordReminderController.remove,
    toggleLifeRoutine: lifeRecordReminderController.toggle,
    viewLifeRoutine: lifeRecordReminderController.view,
  };

  return {
    actions,
    controllers: {
      balanceSheetController,
      accountCenterController,
      wishlistController,
      categoryBudgetController,
      sinkingFundController,
      transactionController,
      transactionSearchController,
      lifeRecordReminderController,
      transactionDetailController,
      importController,
      recoveryCenterController,
      deviceDataController,
      retirementController,
    },
    replaceWholeState,
  };
}
