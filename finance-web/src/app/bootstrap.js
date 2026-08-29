import { CONSTANTS } from "../config/constants.js";
import { getFinanceRuntime } from "../config/runtime.js";
import { cloneState, createInitialState } from "../state/initial-state.js";
import { createStore } from "../state/store.js";
import { getFilterRange, getFilteredTransactions } from "../state/selectors.js";
import {
  LOCAL_STORAGE_SCOPE,
  loadLocalState,
  migrateLegacyLocalState,
  saveLocalState,
  userStorageScope,
} from "../services/storage-local.js";
import { createConflictRecoveryStore, createRecoveryPreserver } from "../services/conflict-recovery.js";
import { setupPWA } from "../services/pwa.js";
import { createRecordCloudSync } from "../services/storage-cloud-records.js";
import { areFinanceStatesEquivalent, buildCloudConflictMessage, hasMeaningfulFinanceData } from "../services/sync-policy.js";
import { exportData } from "../services/import-export.js";
import { backupFilename } from "../services/browser-files.js";
import { createToastManager } from "../ui/toast.js";
import { collectDom } from "./dom-elements.js";
import { localDateStr, formatMoney, escapeHTML, toMoneyInt } from "../utils/format.js";
import { normalizeFinanceStateMoney } from "../utils/normalize-state.js";
import { renderGoalCenter } from "../views/goal-center-view.js";
import { createCommitState } from "./state-commit.js";
import { bindAppEvents } from "./event-bindings.js";
import { createSyncCoordinator } from "./sync-coordinator.js";
import { createControllerComposition } from "./controller-composition.js";
import { createRenderCoordinator } from "./render-coordinator.js";
import { createUiCoordinator } from "./ui-coordinator.js";

function createFallbackCloudSync() {
  return {
    enabled: false,
    error: "",
    save: async () => {},
    resolveConflict: async () => false,
    signInWithGoogle: async () => false,
    signOutToAnonymous: async () => ({ mode: "local" }),
    getUser: () => null,
  };
}

export async function bootstrapFinanceApp(doc = document) {
  setupPWA(doc);

  const runtime = getFinanceRuntime();
  const dom = collectDom(doc);
  const toast = createToastManager(doc);
  const baseState = createInitialState();
  migrateLegacyLocalState(baseState);
  const initialState = createInitialState();
  const store = createStore(initialState);
  const conflictRecoveryStore = createConflictRecoveryStore();
  const utils = { formatMoney, escapeHTML, localDateStr };

  let cloudSync = createFallbackCloudSync();
  let syncCoordinator = null;

  const getFilterRangeValue = () => getFilterRange(doc);
  const getFiltered = () => getFilteredTransactions(store.getState(), getFilterRangeValue());

  const preserveRollback = createRecoveryPreserver({
    recoveryStore: conflictRecoveryStore,
    getScope: () => syncCoordinator?.getLocalScope(),
    exportEmergency: (state, label) => exportData(state, backupFilename(`emergency-${label}`)),
    onSaved: () => toast.show("已在復原中心保留覆蓋前資料，不會自動下載檔案"),
    onEmergency: () => toast.show("瀏覽器無法保存復原紀錄，已改為下載緊急 JSON 備份", "error"),
    onFailure: () => toast.show("無法建立復原紀錄或緊急備份，因此已取消這次覆蓋", "error"),
    onWarn: (message, error) => console.warn(message, error),
  });

  const uiCoordinator = createUiCoordinator({
    runtime,
    dom,
    store,
    toast,
    doc,
    constants: CONSTANTS,
  });
  const { ui } = uiCoordinator;
  const renderCoordinator = createRenderCoordinator({
    store,
    dom,
    constants: CONSTANTS,
    utils,
    ui,
    getFilterRange: getFilterRangeValue,
    getFilteredTransactions: getFiltered,
  });
  const { renderAll } = renderCoordinator;
  const syncNotificationMessages = {
    "unbound-local-state-imported": "已將登入前的本機資料匯入目前帳號。",
    "cloud-sync-paused-by-user": "已取消覆蓋；本次登入的雲端同步已暫停，資料仍保留在此裝置。",
    "cloud-state-applied": "已套用雲端資料。",
    "cloud-conflict-resolution-failed": "雲端衝突處理失敗，資料仍保留在此裝置。",
    "google-sign-in-complete": "Google 登入完成。",
    "signed-out-to-anonymous": "已登出並切回本機模式。",
    "signed-out-to-local": "已登出；目前使用本機模式。",
    "google-sign-in-failed": "登入失敗，請稍後再試。",
    "sign-out-failed": "登出失敗，請稍後再試。",
  };

  syncCoordinator = createSyncCoordinator({
    store,
    createBaseState: createInitialState,
    cloneState,
    localScopeDefault: LOCAL_STORAGE_SCOPE,
    userStorageScope,
    loadLocalState,
    saveLocalState,
    normalizeState: normalizeFinanceStateMoney,
    hasMeaningfulData: hasMeaningfulFinanceData,
    areStatesEquivalent: areFinanceStatesEquivalent,
    buildConflictMessage: buildCloudConflictMessage,
    promptSyncChoice: (request) => ui.askSyncChoice(
      request.type === "record-conflict"
        ? `偵測到 ${request.keys.length} 筆同一紀錄在本機與雲端同時修改。系統不會自動混合內容，請選擇要保留的版本。`
        : request.message,
    ),
    confirmUnboundImport: () => window.confirm("登入帳號目前沒有資料。是否把登入前儲存在這台裝置的資料複製到此帳號？"),
    preserveRollback,
    refreshStateUi: renderCoordinator.refreshWholeStateUi,
    onStatus: (status, meta) => ui.updateCloudStatus(status, meta),
    onNotify: (message, type) => toast.show(syncNotificationMessages[message] || message, type),
    onWarn: (message, error) => console.warn(message, error),
    onAuthViewChange: ({ user, action, cloudEnabled, error }) => ui.renderAuthState(user, cloudEnabled, error, action),
  });
  uiCoordinator.bindSyncCoordinator(syncCoordinator);
  syncCoordinator.attachCloudSync(cloudSync);

  const persistCommittedLocalState = (state) => syncCoordinator.persistCommittedLocalState(state);
  const enqueueCloudState = () => syncCoordinator.enqueueCloudState();
  const saveState = () => {
    persistCommittedLocalState(store.getState());
    enqueueCloudState();
  };

  const commitState = createCommitState({
    store,
    normalizeState: normalizeFinanceStateMoney,
    persistLocal: persistCommittedLocalState,
    enqueueCloud: enqueueCloudState,
  });

  const composition = createControllerComposition({
    dom,
    store,
    ui,
    toast,
    commitState,
    renderCoordinator,
    constants: CONSTANTS,
    utils,
    syncCoordinator,
    conflictRecoveryStore,
    getCloudSync: () => cloudSync,
    saveState,
    enqueueCloudState,
    getFilteredTransactions: getFiltered,
    win: window,
  });
  const { actions, controllers } = composition;
  const {
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
  } = controllers;
  uiCoordinator.bindRetirementController(retirementController);
  const bindEvents = () => bindAppEvents({
    doc,
    win: window,
    dom,
    actions,
    ui,
    handlers: {
      exportData: () => importController.exportBackup(),
      triggerImport: () => dom.fileImport.click(),
      exportAndroMoney: () => importController.exportAndroMoney(),
      triggerAndroMoneyImport: () => dom.fileAndroMoneyImport.click(),
      openRecoveryCenter: recoveryCenterController.open,
      closeRecoveryCenter: recoveryCenterController.close,
      restoreRecovery: recoveryCenterController.restore,
      exportRecovery: recoveryCenterController.exportEntry,
      deleteRecovery: recoveryCenterController.remove,
      openDeviceClear: deviceDataController.open,
      closeDeviceClear: deviceDataController.close,
      backupBeforeDeviceClear: deviceDataController.backup,
      confirmDeviceClear: () => { void deviceDataController.confirm(); },
      changeBalanceType: balanceSheetController.syncFields,
      reconcileAccount: accountCenterController.reconcile,
      cancelAndroMoneyImport: () => importController.cancelAndroMoneyImport(),
      syncAndroMoneyAccountChoice: (select) => importController.syncAndroMoneyAccountChoice(select),
      confirmAndroMoneyImport: () => {
        importController.confirmAndroMoneyImport().catch((error) => {
          console.warn("AndroMoney import failed.", error);
          toast.show("AndroMoney 匯入失敗，請確認 CSV 內容", "error");
        });
      },
      normalizeMoneyInput: (node) => {
        if (node.value) node.value = String(toMoneyInt(node.value));
      },
      updateBudgetCap: categoryBudgetController.updateBudgetCap,
      filterGoalCenter: (filter) => {
        dom.goalCenter.dataset.filter = filter;
        renderGoalCenter({ state: store.getState(), filterRange: getFilterRangeValue(), utils, dom });
      },
      searchTransactions: () => {
        transactionSearchController.handleQueryInput();
      },
      changeTransactionSearchPeriod: transactionSearchController.handlePresetChange,
      clearTransactionSearch: () => {
        transactionSearchController.clear();
      },
      updateRetirementLinked: retirementController.updateLinked,
      runAuthAction: () => syncCoordinator.performAuthAction(),
      retryCloudSync: async () => {
        ui.updateCloudStatus("syncing");
        const saved = await syncCoordinator.enqueueCloudState();
        if (saved) {
          ui.updateCloudStatus("online");
          toast.show("資料已備份到雲端");
          return;
        }
        ui.updateCloudStatus("error");
        toast.show("雲端備份仍未完成，請確認網路後再按一次重試", "error");
      },
      updateRetirementAge: retirementController.updateAge,
      updateRetirementInput: retirementController.updateInput,
      updateRetirementGuardrail: retirementController.updateGuardrail,
      toggleRetirementTable: retirementController.toggleTable,
      importJsonFile: async (event) => {
        if (!event.target.files?.length) return;
        try {
          await importController.importBackupFile(event.target.files[0]);
        } catch (error) {
          toast.show(error.message === "invalid-schema" ? "匯入失敗：檔案格式不符合目前資料模型" : "匯入失敗，請確認 JSON 內容", "error");
        } finally {
          event.target.value = "";
        }
      },
      importAndroMoneyFile: async (event) => {
        if (!event.target.files?.length) return;
        try {
          await importController.openAndroMoneyImport(event.target.files[0]);
        } catch (error) {
          console.warn("AndroMoney CSV read failed.", error);
          toast.show("AndroMoney 匯入失敗，請確認 CSV 內容", "error");
        } finally {
          event.target.value = "";
        }
      },
      updateConnectivity: (status) => ui.updateCloudStatus(status),
    },
  });

  ui.updateCloudStatus("local");
  ui.syncFromSettings();
  ui.renderTransactionCategorySelect();
  ui.populateCategoryBudgetOptions();
  ui.populateFundOptions();
  ui.syncTxType();
  ui.setFundEditMode({ active: false });
  balanceSheetController.reset();
  wishlistController.reset();
  sinkingFundController.reset();
  transactionController.reset();
  transactionSearchController.reset();
  lifeRecordReminderController.reset();

  const now = new Date();
  dom.headerSub.textContent = `${now.getFullYear()} / ${now.getMonth() + 1}`;
  dom.inputDate.value = localDateStr(now);
  if (dom.fundStart && !dom.fundStart.value) dom.fundStart.value = localDateStr(now).slice(0, 7);
  actions.setDatePreset("month");
  actions.setTxType("expense");

  cloudSync = await createRecordCloudSync({
    getState: () => store.getState(),
    onStatus: (status, meta) => ui.updateCloudStatus(status, meta),
    onUserChange: (user) => syncCoordinator.onUserChange(user),
    onConflict: (conflict) => syncCoordinator.onConflict(conflict).catch((error) => {
      console.warn("Cloud conflict dialog failed.", error);
      ui.updateCloudStatus("error");
    }),
    onRemoteState: (remoteState, metadata) => syncCoordinator.onRemoteState(remoteState, metadata).catch((error) => {
      console.warn("Cloud state handling failed.", error);
      ui.updateCloudStatus("error");
    }),
  });
  syncCoordinator.attachCloudSync(cloudSync);
  syncCoordinator.ensureLocalScopeIfDisabled();
  bindEvents();

  renderAll();

  return { store, actions, renderAll };
}
