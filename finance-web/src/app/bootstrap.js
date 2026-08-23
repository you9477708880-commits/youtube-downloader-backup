import { CATEGORY_SUBCATEGORY_SUGGESTIONS, CONSTANTS, DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { cloneState, createInitialState } from "../state/initial-state.js";
import { createStore } from "../state/store.js";
import { getFilterRange, getFilteredTransactions } from "../state/selectors.js";
import {
  LOCAL_STORAGE_SCOPE,
  loadLocalState,
  migrateLegacyLocalState,
  saveRollbackSnapshot,
  saveLocalState,
  userStorageScope,
} from "../services/storage-local.js";
import { setupPWA } from "../services/pwa.js";
import { createRecordCloudSync } from "../services/storage-cloud-records.js";
import { areFinanceStatesEquivalent, buildCloudConflictMessage, hasMeaningfulFinanceData } from "../services/sync-policy.js";
import { buildAndroMoneyCsv, parseAndroMoneyCsv } from "../services/andromoney-csv.js";
import { exportData, importData } from "../services/import-export.js";
import { createToastManager } from "../ui/toast.js";
import { $ } from "../ui/dom.js";
import { setActiveTab } from "../ui/tabs.js";
import { localDateStr, formatMoney, escapeHTML, toMoneyInt } from "../utils/format.js";
import { normalizeFinanceStateMoney } from "../utils/normalize-state.js";
import { renderOverview } from "../views/overview-view.js";
import { renderLedger } from "../views/ledger-view.js";
import { renderCashFlow } from "../views/cashflow-view.js";
import { renderBalanceSheet } from "../views/balance-sheet-view.js";
import { renderMonthlyReview } from "../views/monthly-review-view.js";
import { renderWishlist } from "../views/wishlist-view.js";
import { renderGoalCenter } from "../views/goal-center-view.js";
import { renderRetirement } from "../views/retirement-view.js";
import { createActions } from "./actions.js";
import { createWholeStateReplacer } from "./controller-lifecycle.js";
import { createCommitState } from "./state-commit.js";
import { createBalanceSheetController } from "./controllers/balance-sheet-controller.js";
import { createSinkingFundController } from "./controllers/sinking-fund-controller.js";
import { createTransactionController } from "./controllers/transaction-controller.js";
import { createWishlistController } from "./controllers/wishlist-controller.js";
import { createImportController } from "./controllers/import-controller.js";
import { createCategoryBudgetController } from "./controllers/category-budget-controller.js";
import { createRetirementController } from "./controllers/retirement-controller.js";
import { createTransactionSearchController } from "./controllers/transaction-search-controller.js";
import { createTransactionDetailController } from "./controllers/transaction-detail-controller.js";
import { bindAppEvents } from "./event-bindings.js";
import { createSyncCoordinator } from "./sync-coordinator.js";

function collectDom(doc = document) {
  return {
    root: doc,
    headerSub: $("hdr-s", doc),
    cloudStatus: $("cloud-status", doc),
    authButton: $("auth-btn", doc),
    headerTag: $("hdr-tag", doc),
    filterPreset: $("f-preset", doc),
    filterStart: $("f-start", doc),
    filterEnd: $("f-end", doc),
    inputAmount: $("i-amt", doc),
    inputDesc: $("i-desc", doc),
    inputDate: $("i-date", doc),
    inputCategory: $("i-cat", doc),
    inputSubcategory: $("i-subcat", doc),
    inputSubcategoryOptions: $("i-subcat-options", doc),
    inputFund: $("i-fund", doc),
    inputOwnAmount: $("i-own", doc),
    inputAdvancePerson: $("i-person", doc),
    inputAccount: $("i-acc", doc),
    inputFromAccount: $("i-from", doc),
    inputToAccount: $("i-to", doc),
    txFormTitle: $("tx-form-title", doc),
    txEditNote: $("tx-edit-note", doc),
    txSubmitButton: $("tx-submit-btn", doc),
    txCancelButton: $("tx-cancel-btn", doc),
    incomeButton: $("b-i", doc),
    expenseButton: $("b-e", doc),
    transferButton: $("b-t", doc),
    advanceButton: $("b-a", doc),
    incomeExpenseAccountWrap: $("f-ie-acc", doc),
    categoryWrap: $("f-cat-group", doc),
    fundWrap: $("f-fund-group", doc),
    advanceWrap: $("f-adv-group", doc),
    transferWrap: $("f-tr-acc", doc),
    oIncome: $("o-i", doc),
    oExpense: $("o-e", doc),
    oNet: $("o-n", doc),
    oBars: $("o-bars", doc),
    oTx: $("o-tx", doc),
    monthlyReview: $("monthly-review", doc),
    aTx: $("a-tx", doc),
    advList: $("adv-list", doc),
    txCount: $("tx-cnt", doc),
    transactionSearchQuery: $("tx-search-query", doc),
    transactionSearchPreset: $("tx-search-preset", doc),
    transactionSearchStart: $("tx-search-start", doc),
    transactionSearchEnd: $("tx-search-end", doc),
    transactionSearchClear: $("tx-search-clear", doc),
    transactionSearchCustom: $("tx-search-custom", doc),
    transactionSearchStatus: $("tx-search-status", doc),
    transactionSearchSummary: $("tx-search-summary", doc),
    transactionSearchEmpty: $("tx-search-empty", doc),
    cashflowBody: $("cf-b", doc),
    balanceSheetBody: $("bs-b", doc),
    budgetCap: $("bs-cap", doc),
    budgetExpense: $("bs-exp", doc),
    budgetFundContribution: $("bs-fund", doc),
    budgetAvailable: $("bs-avail", doc),
    budgetPlanningRoom: $("bs-room", doc),
    overviewFill: $("ov-fill", doc),
    overviewCapLabel: $("ov-cap-lbl", doc),
    overviewBudget: $("o-bud", doc),
    budgetModeNote: $("bud-mode-note", doc),
    budgetSourceList: $("bud-source-list", doc),
    leftoverNote: $("leftover-note", doc),
    categoryBudgetList: $("cb-list", doc),
    goalCenter: $("goal-center", doc),
    wishList: $("wl-list", doc),
    budgetCapInput: $("bud-cap", doc),
    fundName: $("sf-name", doc),
    fundCategory: $("sf-cat", doc),
    fundTarget: $("sf-target", doc),
    fundMonthly: $("sf-monthly", doc),
    fundStart: $("sf-start", doc),
    fundTargetMonth: $("sf-target-month", doc),
    fundNote: $("sf-note", doc),
    fundCarry: $("sf-carry", doc),
    fundFormTitle: $("fund-form-title", doc),
    fundEditNote: $("fund-edit-note", doc),
    fundSubmitButton: $("fund-submit-btn", doc),
    fundCancelButton: $("fund-cancel-btn", doc),
    fundList: $("sf-list", doc),
    bsFormTitle: $("bs-form-title", doc),
    bsEditNote: $("bs-edit-note", doc),
    bsSubmitButton: $("bs-submit-btn", doc),
    bsCancelButton: $("bs-cancel-btn", doc),
    balanceName: $("bs-n", doc),
    balanceType: $("bs-t", doc),
    balanceCategoryWrap: $("bs-cat-wrap", doc),
    balanceCategory: $("bs-c", doc),
    balanceEmergency: $("bs-em", doc),
    balanceAmount: $("bs-a", doc),
    catBudgetCategory: $("cb-cat", doc),
    catBudgetAmount: $("cb-amt", doc),
    wishName: $("w-name", doc),
    wishPrice: $("w-price", doc),
    wishCategory: $("w-cat", doc),
    wishFormTitle: $("wish-form-title", doc),
    wishEditNote: $("wish-edit-note", doc),
    wishSubmitButton: $("wish-submit-btn", doc),
    wishCancelButton: $("wish-cancel-btn", doc),
    fileImport: $("file-import", doc),
    fileAndroMoneyImport: $("file-andromoney-import", doc),
    androMoneyModal: $("andromoney-modal", doc),
    androMoneySummary: $("andromoney-summary", doc),
    androMoneyAccounts: $("andromoney-accounts", doc),
    androMoneyDuplicates: $("andromoney-duplicates", doc),
    androMoneyDuplicateMode: $("andromoney-duplicate-mode", doc),
    androMoneyPreview: $("andromoney-preview", doc),
    androMoneyConfirm: $("andromoney-confirm", doc),
    androMoneyCancel: $("andromoney-cancel", doc),
    retireLinked: $("r-linked", doc),
    retireManualWrap: $("r-manual-wrap", doc),
    retireLinkedValue: $("r-linked-val", doc),
    currentAge: $("rc", doc),
    retirementAge: $("rr", doc),
    deathAge: $("rd", doc),
    retireAsset: $("rs0", doc),
    retireMonthly: $("rs1", doc),
    retirePrincipalReturn: $("rs2", doc),
    retireContributionReturn: $("rs3", doc),
    retireInflation: $("rs4", doc),
    retireWithdraw: $("rs5", doc),
    retireTarget: $("rs6", doc),
    retireAssetValue: $("sv0", doc),
    retireMonthlyValue: $("sv1", doc),
    retirePrincipalReturnValue: $("sv2", doc),
    retireContributionReturnValue: $("sv3", doc),
    retireInflationValue: $("sv4", doc),
    retireWithdrawValue: $("sv5", doc),
    retireTargetValue: $("sv6", doc),
    retireAssetAtRetire: $("r-a", doc),
    retireAchieve: $("r-p", doc),
    retirePaid: $("r-pr", doc),
    retireGain: $("r-g", doc),
    retireSuggestion: $("r-sg", doc),
    retireTable: $("r-tbl", doc),
    tableWrap: $("tbl-w", doc),
    tableToggleLabel: $("tg-lbl", doc),
    choiceModal: $("choice-modal", doc),
    choiceSummary: $("choice-summary", doc),
    choiceCancel: $("choice-cancel", doc),
    syncChoiceModal: $("sync-choice-modal", doc),
    syncChoiceSummary: $("sync-choice-summary", doc),
    transactionDetailModal: $("transaction-detail-modal", doc),
    transactionDetailTitle: $("transaction-detail-title", doc),
    transactionDetailBody: $("transaction-detail-body", doc),
    transactionDetailEdit: $("transaction-detail-edit", doc),
    transactionDetailClose: $("transaction-detail-close", doc),
  };
}

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

function backupFilename(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `finance-backup-${label}-${stamp}.json`;
}

function readFileAsText(file) {
  if (typeof file?.text === "function") {
    return file.text().then((value) => String(value || ""));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsText(file, "utf-8");
  });
}

function downloadTextFile({ content, filename, type }) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function bootstrapFinanceApp(doc = document) {
  setupPWA();

  const dom = collectDom(doc);
  const toast = createToastManager(doc);
  const baseState = createInitialState();
  migrateLegacyLocalState(baseState);
  const initialState = createInitialState();
  const store = createStore(initialState);
  const utils = { formatMoney, escapeHTML, localDateStr };

  let cloudSync = createFallbackCloudSync();
  let syncCoordinator = null;

  const getFilterRangeValue = () => getFilterRange(doc);
  const getFiltered = () => getFilteredTransactions(store.getState(), getFilterRangeValue());

  const preserveRollback = (state, label) => {
    const localScope = syncCoordinator?.getLocalScope();
    if (!localScope) return false;
    try {
      saveRollbackSnapshot(state, localScope, label);
      exportData(state, backupFilename(label));
      return true;
    } catch (error) {
      console.warn("Rollback snapshot could not be saved.", error);
      toast.show("無法建立覆蓋前復原快照，因此已取消這次同步選擇", "error");
      return false;
    }
  };

  let retirementController = null;
  let transactionSearchController = null;

  const ui = {
    toast,
    setActiveTab: (tabId) => setActiveTab(tabId, doc),
    updateCloudStatus(status, meta) {
      const currentUser = syncCoordinator?.getCurrentUser();
      const hasCloudUser = currentUser && !currentUser.isAnonymous;
      const setRetryState = (enabled, title) => {
        dom.cloudStatus.disabled = !enabled;
        dom.cloudStatus.title = title;
        dom.cloudStatus.setAttribute("aria-label", title);
      };
      if (status === "syncing") {
        dom.cloudStatus.textContent = hasCloudUser ? "☁️ 正在備份" : "💾 僅本機";
        dom.cloudStatus.className = "cloud-st";
        dom.cloudStatus.dataset.state = hasCloudUser ? "syncing" : "local";
        setRetryState(false, hasCloudUser ? "資料正在備份到雲端" : "目前只保存於這台裝置");
        return;
      }

      if (status === "online") {
        dom.cloudStatus.textContent = hasCloudUser ? (meta?.fromCache ? "☁️ 已連線（快取）" : "☁️ 已備份") : "💾 僅本機";
        dom.cloudStatus.className = hasCloudUser ? "cloud-st" : "cloud-st off";
        dom.cloudStatus.dataset.state = hasCloudUser ? (meta?.fromCache ? "cache" : "cloud") : "local";
        setRetryState(Boolean(hasCloudUser), hasCloudUser ? "立即再次備份到雲端" : "目前只保存於這台裝置");
        return;
      }

      if (status === "offline") {
        dom.cloudStatus.textContent = hasCloudUser ? "☁️ 離線｜重試" : "💾 僅本機";
        dom.cloudStatus.className = "cloud-st off";
        dom.cloudStatus.dataset.state = "offline";
        setRetryState(Boolean(hasCloudUser), hasCloudUser ? "重新嘗試備份到雲端" : "目前只保存於這台裝置");
        return;
      }

      if (status === "error") {
        dom.cloudStatus.textContent = "⚠️ 備份失敗｜重試";
        dom.cloudStatus.className = "cloud-st off";
        dom.cloudStatus.dataset.state = "warning";
        setRetryState(Boolean(hasCloudUser), hasCloudUser ? "備份尚未完成；按此立即重試" : "請先登入 Google 才能備份到雲端");
        return;
      }

      if (status === "conflict") {
        dom.cloudStatus.textContent = "⚠️ 待選擇資料";
        dom.cloudStatus.className = "cloud-st off";
        dom.cloudStatus.dataset.state = "conflict";
        setRetryState(false, "請先在同步視窗選擇保留雲端或本機資料");
        return;
      }

      dom.cloudStatus.textContent = "💾 僅本機";
      dom.cloudStatus.className = "cloud-st off";
      dom.cloudStatus.dataset.state = "local";
      setRetryState(false, "目前只保存於這台裝置");
    },
    renderAuthState(user, cloudEnabled, errorMessage = "", action = null) {
      if (!cloudEnabled) {
        dom.authButton.disabled = true;
        dom.authButton.className = "auth-btn";
        dom.authButton.textContent = "Firebase 未啟用";
        dom.headerTag.textContent = "本機模式";
        dom.headerTag.dataset.state = "local";
        dom.headerTag.title = errorMessage || "目前僅使用本機資料。本機會保留這台裝置最近一次使用的內容。";
        return;
      }

      dom.authButton.disabled = action !== null;

      if (action === "signing-in") {
        dom.authButton.className = "auth-btn google";
        dom.authButton.textContent = "登入中...";
        dom.headerTag.textContent = "正在連接雲端";
        dom.headerTag.dataset.state = "pending";
        return;
      }

      if (action === "signing-out") {
        dom.authButton.className = "auth-btn logout";
        dom.authButton.textContent = "登出中...";
        dom.headerTag.textContent = "切回本機模式";
        dom.headerTag.dataset.state = "pending";
        return;
      }

      if (!user || user.isAnonymous) {
        dom.authButton.className = "auth-btn google";
        dom.authButton.textContent = "Google 登入";
        dom.headerTag.textContent = "本機模式";
        dom.headerTag.dataset.state = "anon";
        dom.headerTag.title = "目前顯示這台裝置的未綁定本機資料。Google 帳號資料會依 UID 分開保存，登出後不會繼續顯示帳號內的財務內容。";
        return;
      }

      dom.authButton.className = "auth-btn logout";
      dom.authButton.textContent = "登出";
      dom.headerTag.textContent = `使用者：${user.displayName || user.email || "Google 使用者"}`;
      dom.headerTag.dataset.state = "cloud";
      dom.headerTag.title = `${user.displayName || user.email || "Google 使用者"}｜這台裝置的本機資料會跟著最近一次同步或登入的內容更新。`;
    },
    syncFromSettings() {
      const state = store.getState();
      dom.budgetCapInput.value = state.settings.budgetCap;
      retirementController?.syncFromSettings();
    },
    askFundShortfallChoice({ fundName, availableFromFund, amount, shortfall, availableFreedom }) {
      return new Promise((resolve) => {
        dom.choiceSummary.textContent =
          `「${fundName}」目前可用 ${formatMoney(availableFromFund)}，這筆支出是 ${formatMoney(amount)}，還差 ${formatMoney(shortfall)}。` +
          ` 本月可自由運用目前是 ${formatMoney(availableFreedom)}。`;

        const close = (choice) => {
          dom.choiceModal.classList.add("d-none");
          dom.choiceModal.querySelectorAll("[data-choice]").forEach((button) => {
            button.removeEventListener("click", onChoice);
          });
          dom.choiceCancel.removeEventListener("click", onCancel);
          resolve(choice);
        };
        const onChoice = (event) => close(event.currentTarget.dataset.choice);
        const onCancel = () => close("");

        dom.choiceModal.querySelectorAll("[data-choice]").forEach((button) => {
          button.addEventListener("click", onChoice);
        });
        dom.choiceCancel.addEventListener("click", onCancel);
        dom.choiceModal.classList.remove("d-none");

        const defaultChoice = availableFreedom >= shortfall ? "topup" : "partial";
        dom.choiceModal.querySelector(`[data-choice="${defaultChoice}"]`)?.focus();
      });
    },
    askSyncChoice(message) {
      return new Promise((resolve) => {
        dom.syncChoiceSummary.textContent = message;

        const close = (choice) => {
          dom.syncChoiceModal.classList.add("d-none");
          dom.syncChoiceModal.querySelectorAll("[data-sync-choice]").forEach((button) => {
            button.removeEventListener("click", onChoice);
          });
          resolve(choice);
        };
        const onChoice = (event) => close(event.currentTarget.dataset.syncChoice);

        dom.syncChoiceModal.querySelectorAll("[data-sync-choice]").forEach((button) => {
          button.addEventListener("click", onChoice);
        });
        dom.syncChoiceModal.classList.remove("d-none");
        dom.syncChoiceModal.querySelector('[data-sync-choice="cancel"]')?.focus();
      });
    },
    populateCategoryBudgetOptions() {
      const state = store.getState();
      const categories = [...CONSTANTS.expenseCategories, ...state.userCats.expense];
      dom.catBudgetCategory.innerHTML = categories.map((category) => `<option>${escapeHTML(category)}</option>`).join("");
      dom.fundCategory.innerHTML = categories.map((category) => `<option>${escapeHTML(category)}</option>`).join("");
    },
    populateFundOptions() {
      dom.inputFund.innerHTML = ['<option value="">不指定</option>']
        .concat(store.getState().sinkingFunds.map((fund) => `<option value="${escapeHTML(fund.id)}">${escapeHTML(fund.name)}</option>`))
        .join("");
    },
    renderTransactionCategorySelect({ resetSubcategory = false } = {}) {
      const state = store.getState();
      if (state.txType === "transfer") return;
      const categoryType = state.txType === "income" ? "income" : "expense";
      const base = categoryType === "income" ? CONSTANTS.incomeCategories : CONSTANTS.expenseCategories;
      const categories = [...base, ...state.userCats[categoryType]];
      const previousCategory = dom.inputCategory.value;
      dom.inputCategory.innerHTML = categories.map((category) => `<option>${escapeHTML(category)}</option>`).join("");
      if (categories.includes(previousCategory)) dom.inputCategory.value = previousCategory;
      this.populateTransactionSubcategoryOptions({ reset: resetSubcategory });
    },
    populateTransactionSubcategoryOptions({ reset = false } = {}) {
      if (!dom.inputSubcategoryOptions) return;
      const state = store.getState();
      const categoryType = state.txType === "income" ? "income" : "expense";
      const category = dom.inputCategory.value;
      const suggestionSet = new Set([DEFAULT_SUBCATEGORY]);
      (CATEGORY_SUBCATEGORY_SUGGESTIONS[categoryType]?.[category] || []).forEach((item) => suggestionSet.add(item));
      state.txs
        .filter((tx) => (tx.category || tx.cat) === category && tx.subcategory)
        .forEach((tx) => suggestionSet.add(tx.subcategory));
      dom.inputSubcategoryOptions.innerHTML = [...suggestionSet].map((item) => `<option value="${escapeHTML(item)}"></option>`).join("");
      if (reset && dom.inputSubcategory) dom.inputSubcategory.value = DEFAULT_SUBCATEGORY;
    },
    syncTxType() {
      const { txType } = store.getState();
      dom.incomeButton.className = `tb${txType === "income" ? " on-inc" : ""}`;
      dom.expenseButton.className = `tb${txType === "expense" ? " on-exp" : ""}`;
      dom.transferButton.className = `tb${txType === "transfer" ? " on-trn" : ""}`;
      dom.advanceButton.className = `tb${txType === "advance" ? " on-trn" : ""}`;

      if (txType === "transfer") {
        dom.incomeExpenseAccountWrap.classList.add("d-none");
        dom.categoryWrap.classList.add("d-none");
        dom.fundWrap.classList.add("d-none");
        dom.advanceWrap.classList.add("d-none");
        dom.transferWrap.classList.remove("d-none");
      } else {
        dom.incomeExpenseAccountWrap.classList.remove("d-none");
        dom.categoryWrap.classList.remove("d-none");
        dom.fundWrap.classList.toggle("d-none", txType !== "expense");
        dom.advanceWrap.classList.toggle("d-none", txType !== "advance");
        dom.transferWrap.classList.add("d-none");
      }
    },
    setTransactionEditMode({ active, linkedFundName = "", advanceRepaidAmount = 0 } = {}) {
      dom.txFormTitle.textContent = active ? "編輯交易" : "新增交易";
      dom.txSubmitButton.textContent = active ? "儲存修改" : "儲存記錄";
      dom.txCancelButton.classList.toggle("d-none", !active);
      const notes = [];
      if (linkedFundName) {
        notes.push(`這筆交易原本對應「${linkedFundName}」。儲存修改時會先移除舊的準備事件，請重新決定是否指定準備。`);
      }
      if (advanceRepaidAmount > 0) {
        notes.push(`這筆代墊已收回 ${formatMoney(advanceRepaidAmount)}；修改後的應收款不能低於已收金額。`);
      }
      dom.txEditNote.classList.toggle("d-none", !active || !notes.length);
      dom.txEditNote.textContent = notes.join(" ");
      [dom.incomeButton, dom.expenseButton, dom.transferButton, dom.advanceButton].forEach((button) => {
        button.disabled = !!active;
      });
    },
    setFundEditMode({ active } = {}) {
      dom.fundFormTitle.textContent = active ? "2. 編輯大額支出準備" : "2. 大額支出準備";
      dom.fundSubmitButton.textContent = active ? "儲存修改" : "新增準備項目";
      dom.fundCancelButton.classList.toggle("d-none", !active);
      dom.fundEditNote.classList.toggle("d-none", !active);
      dom.fundEditNote.textContent = active
        ? "修改每月提撥、起始月份或目標月份後，系統會用新設定直接重算過去與未來的規劃提撥；既有補入 / 動用事件不會被改寫。"
        : "";
    },
    setBalanceSheetEditMode({ active, isAccount = false } = {}) {
      dom.bsFormTitle.textContent = active ? (isAccount ? "編輯帳戶" : "編輯資產 / 負債") : "新增帳戶 / 資產負債";
      dom.bsSubmitButton.textContent = active ? "儲存修改" : "新增項目";
      dom.bsCancelButton.classList.toggle("d-none", !active);
      dom.bsEditNote.classList.toggle("d-none", !active || !isAccount);
      dom.bsEditNote.textContent = active && isAccount ? "帳戶可能已被交易引用，編輯時會保留帳戶類型與帳戶 ID。" : "";
      dom.balanceType.disabled = !!active;
    },
    setWishEditMode({ active } = {}) {
      dom.wishFormTitle.textContent = active ? "4. 編輯待購項目" : "4. 待購清單（花費可自由運用）";
      dom.wishSubmitButton.textContent = active ? "儲存修改" : "加入清單";
      dom.wishCancelButton.classList.toggle("d-none", !active);
      dom.wishEditNote.classList.toggle("d-none", !active);
      dom.wishEditNote.textContent = active ? "編輯只會更新這個待購項目，不會改變目前排序。" : "";
    },
  };

  const renderBudgetOnly = () => {
    const state = store.getState();
    const filterRange = getFilterRangeValue();
    renderGoalCenter({ state, filterRange, utils, dom });
    renderWishlist({ state, filterRange, constants: CONSTANTS, utils, dom });
  };

  const renderAll = () => {
    const state = store.getState();
    const filteredTxs = getFiltered();
    const filterRange = getFilterRangeValue();
    renderOverview({ state, filteredTxs, constants: CONSTANTS, utils, dom });
    renderMonthlyReview({ state, filterRange, utils, dom });
    if (transactionSearchController) transactionSearchController.render();
    else renderLedger({ state, filteredTxs, constants: CONSTANTS, utils, dom });
    renderCashFlow({ state, filteredTxs, utils, dom });
    renderBalanceSheet({ state, utils, dom });
    renderGoalCenter({ state, filterRange, utils, dom });
    renderWishlist({ state, filterRange, constants: CONSTANTS, utils, dom });
    renderRetirement({ state, utils, dom });
  };

  const refreshWholeStateUi = () => {
    dom.goalCenter.dataset.filter = "all";
    ui.syncFromSettings();
    ui.renderTransactionCategorySelect();
    ui.populateCategoryBudgetOptions();
    ui.populateFundOptions();
    ui.syncTxType();
    renderAll();
  };

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
    refreshStateUi: refreshWholeStateUi,
    onStatus: (status, meta) => ui.updateCloudStatus(status, meta),
    onNotify: (message, type) => toast.show(syncNotificationMessages[message] || message, type),
    onWarn: (message, error) => console.warn(message, error),
    onAuthViewChange: ({ user, action, cloudEnabled, error }) => ui.renderAuthState(user, cloudEnabled, error, action),
  });
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

  const context = {
    dom,
    store,
    ui,
    constants: CONSTANTS,
    commitState,
    renderAll,
    renderWishlist: renderBudgetOnly,
  };

  let replaceWholeState = null;
  const baseActions = createActions(context);
  const balanceSheetController = createBalanceSheetController({
    elements: {
      root: dom.root,
      name: dom.balanceName,
      type: dom.balanceType,
      categoryWrap: dom.balanceCategoryWrap,
      category: dom.balanceCategory,
      amount: dom.balanceAmount,
      emergency: dom.balanceEmergency,
    },
    store,
    toast,
    setEditMode: (value) => ui.setBalanceSheetEditMode(value),
    commitState,
    renderAll,
    navigate: (tabId) => baseActions.switchTab(tabId),
    confirmDelete: (message) => window.confirm(message),
  });
  const wishlistController = createWishlistController({
    elements: {
      root: dom.root,
      name: dom.wishName,
      price: dom.wishPrice,
      category: dom.wishCategory,
    },
    store,
    toast,
    setEditMode: (value) => ui.setWishEditMode(value),
    commitState,
    renderWishlist: renderBudgetOnly,
    navigate: (tabId) => baseActions.switchTab(tabId),
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
    constants: CONSTANTS,
    promptInput: (message) => window.prompt(message),
    confirmCleanup: (message) => window.confirm(message),
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
    navigate: (tabId) => baseActions.switchTab(tabId),
    populateFundOptions: () => ui.populateFundOptions(),
    confirmAction: (message) => window.confirm(message),
    promptInput: (message, defaultValue) => window.prompt(message, defaultValue),
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
    navigate: (tabId) => baseActions.switchTab(tabId),
    syncTxType: () => ui.syncTxType(),
    renderTransactionCategorySelect: (options) => ui.renderTransactionCategorySelect(options),
    populateTransactionSubcategoryOptions: (options) => ui.populateTransactionSubcategoryOptions(options),
    populateFundOptions: () => ui.populateFundOptions(),
    populateCategoryBudgetOptions: () => ui.populateCategoryBudgetOptions(),
    askFundShortfallChoice: (details) => ui.askFundShortfallChoice(details),
    constants: CONSTANTS,
    confirmDelete: (message) => window.confirm(message),
    promptInput: (message, defaultValue) => window.prompt(message, defaultValue),
  });
  transactionSearchController = createTransactionSearchController({
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
    getReportTransactions: getFiltered,
    renderTransactions: (transactions) => renderLedger({
      state: store.getState(),
      filteredTxs: transactions,
      constants: CONSTANTS,
      utils,
      dom,
    }),
  });
  const transactionDetailController = createTransactionDetailController({
    elements: {
      modal: dom.transactionDetailModal,
      title: dom.transactionDetailTitle,
      body: dom.transactionDetailBody,
      edit: dom.transactionDetailEdit,
      close: dom.transactionDetailClose,
    },
    store,
    formatMoney,
    escapeHTML,
    updateTransaction: (id, input) => transactionController.updateTransactionFromDetail(id, input),
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
  retirementController = createRetirementController({
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
  replaceWholeState = createWholeStateReplacer({
    store,
    controllers: [balanceSheetController, wishlistController, categoryBudgetController, sinkingFundController, transactionController, transactionSearchController, transactionDetailController, importController, retirementController],
  });
  syncCoordinator.bindWholeStateReplacer(replaceWholeState);
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
    cancelTransactionDetailEdit: transactionDetailController.cancelEdit,
    saveTransactionDetail: transactionDetailController.saveEdit,
    syncTransactionDetailType: transactionDetailController.syncEditorType,
    closeTransactionDetail: transactionDetailController.close,
    trapTransactionDetailFocus: transactionDetailController.trapFocus,
  };

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
      changeBalanceType: (value) => dom.balanceCategoryWrap.classList.toggle("d-none", value !== "item"),
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
      searchTransactions: transactionSearchController.handleQueryInput,
      changeTransactionSearchPeriod: transactionSearchController.handlePresetChange,
      clearTransactionSearch: transactionSearchController.clear,
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
