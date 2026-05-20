import { CATEGORY_SUBCATEGORY_SUGGESTIONS, CONSTANTS, DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { createInitialState } from "../state/initial-state.js";
import { createStore } from "../state/store.js";
import { getFilterRange, getFilteredTransactions } from "../state/selectors.js";
import { loadLocalState, saveLocalState } from "../services/storage-local.js";
import { setupPWA } from "../services/pwa.js";
import { createCloudSync } from "../services/storage-cloud.js";
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
import { renderWishlist } from "../views/wishlist-view.js";
import { renderRetirement } from "../views/retirement-view.js";
import { createActions } from "./actions.js";

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
    aTx: $("a-tx", doc),
    advList: $("adv-list", doc),
    txCount: $("tx-cnt", doc),
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
  };
}

function createFallbackCloudSync() {
  return {
    enabled: false,
    error: "",
    save: async () => {},
    signInWithGoogle: async () => false,
    signOutToAnonymous: async () => ({ mode: "local" }),
    getUser: () => null,
  };
}

export async function bootstrapFinanceApp(doc = document) {
  setupPWA();

  const dom = collectDom(doc);
  const toast = createToastManager(doc);
  const baseState = createInitialState();
  const initialState = loadLocalState(baseState);
  const store = createStore(initialState);
  const utils = { formatMoney, escapeHTML, localDateStr };

  let cloudSync = createFallbackCloudSync();
  let currentUser = null;
  let authAction = null;

  const getFilterRangeValue = () => getFilterRange(doc);
  const getFiltered = () => getFilteredTransactions(store.getState(), getFilterRangeValue());

  const syncRetirementInputs = () => {
    dom.retireAssetValue.textContent = formatMoney(dom.retireAsset.value || 0);
    dom.retireMonthlyValue.textContent = formatMoney(dom.retireMonthly.value || 0);
    dom.retirePrincipalReturnValue.textContent = `${parseFloat(dom.retirePrincipalReturn.value || 0).toFixed(1)}%`;
    dom.retireContributionReturnValue.textContent = `${parseFloat(dom.retireContributionReturn.value || 0).toFixed(1)}%`;
    dom.retireInflationValue.textContent = `${parseFloat(dom.retireInflation.value || 0).toFixed(1)}%`;
    dom.retireWithdrawValue.textContent = formatMoney(dom.retireWithdraw.value || 0);
    dom.retireTargetValue.textContent = formatMoney(dom.retireTarget.value || 0);
  };

  const ui = {
    toast,
    setActiveTab: (tabId) => setActiveTab(tabId, doc),
    updateCloudStatus(status, meta) {
      const hasCloudUser = currentUser && !currentUser.isAnonymous;
      if (status === "syncing") {
        dom.cloudStatus.textContent = hasCloudUser ? "☁️ 同步中" : "💾 僅本機";
        dom.cloudStatus.className = "cloud-st";
        dom.cloudStatus.dataset.state = hasCloudUser ? "syncing" : "local";
        return;
      }

      if (status === "online") {
        dom.cloudStatus.textContent = hasCloudUser ? (meta?.fromCache ? "☁️ 已連線（快取）" : "☁️ 雲端同步") : "💾 僅本機";
        dom.cloudStatus.className = hasCloudUser ? "cloud-st" : "cloud-st off";
        dom.cloudStatus.dataset.state = hasCloudUser ? (meta?.fromCache ? "cache" : "cloud") : "local";
        return;
      }

      if (status === "offline") {
        dom.cloudStatus.textContent = "☁️ 暫時離線";
        dom.cloudStatus.className = "cloud-st off";
        dom.cloudStatus.dataset.state = "offline";
        return;
      }

      if (status === "error") {
        dom.cloudStatus.textContent = "☁️ 同步提醒";
        dom.cloudStatus.className = "cloud-st off";
        dom.cloudStatus.dataset.state = "warning";
        return;
      }

      dom.cloudStatus.textContent = "💾 僅本機";
      dom.cloudStatus.className = "cloud-st off";
      dom.cloudStatus.dataset.state = "local";
    },
    renderAuthState(user, cloudEnabled, errorMessage = "") {
      if (!cloudEnabled) {
        dom.authButton.disabled = true;
        dom.authButton.className = "auth-btn";
        dom.authButton.textContent = "Firebase 未啟用";
        dom.headerTag.textContent = "本機模式";
        dom.headerTag.dataset.state = "local";
        dom.headerTag.title = errorMessage || "目前僅使用本機資料。本機會保留這台裝置最近一次使用的內容。";
        return;
      }

      dom.authButton.disabled = authAction !== null;

      if (authAction === "signing-in") {
        dom.authButton.className = "auth-btn google";
        dom.authButton.textContent = "登入中...";
        dom.headerTag.textContent = "正在連接雲端";
        dom.headerTag.dataset.state = "pending";
        return;
      }

      if (authAction === "signing-out") {
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
        dom.headerTag.title = "目前資料保存在這台裝置，可登入 Google 啟用雲端同步。若切換不同 Google 帳號，本機看到的內容可能會變成最近登入帳號的版本。";
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
      dom.retireLinked.checked = state.settings.retLinked;
      dom.retireAsset.value = state.settings.retManualAsset;
      this.toggleRetLinkUI();
    },
    toggleRetLinkUI() {
      const linked = store.getState().settings.retLinked;
      dom.retireManualWrap.classList.toggle("opacity-50", linked);
      dom.retireManualWrap.classList.toggle("pointer-none", linked);
      dom.retireAsset.disabled = linked;
    },
    toggleRetirementTable() {
      dom.tableWrap.classList.toggle("d-none");
      dom.tableToggleLabel.textContent = dom.tableWrap.classList.contains("d-none") ? "展開 ▼" : "收合 ▲";
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
    populateCategoryBudgetOptions() {
      const state = store.getState();
      const categories = [...CONSTANTS.expenseCategories, ...state.userCats.expense];
      dom.catBudgetCategory.innerHTML = categories.map((category) => `<option>${escapeHTML(category)}</option>`).join("");
      dom.fundCategory.innerHTML = categories.map((category) => `<option>${escapeHTML(category)}</option>`).join("");
    },
    populateFundOptions() {
      dom.inputFund.innerHTML = ['<option value="">不指定</option>']
        .concat(store.getState().sinkingFunds.map((fund) => `<option value="${fund.id}">${escapeHTML(fund.name)}</option>`))
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

  const saveState = async () => {
    saveLocalState(store.getState());
    if (!cloudSync.enabled || !currentUser || currentUser.isAnonymous) return;

    try {
      await cloudSync.save();
    } catch {
      ui.updateCloudStatus("error");
    }
  };

  const renderWishlistOnly = () =>
    renderWishlist({ state: store.getState(), filterRange: getFilterRangeValue(), constants: CONSTANTS, utils, dom });

  const renderAll = () => {
    const state = store.getState();
    const filteredTxs = getFiltered();
    const filterRange = getFilterRangeValue();
    renderOverview({ state, filteredTxs, constants: CONSTANTS, utils, dom });
    renderLedger({ state, filteredTxs, constants: CONSTANTS, utils, dom });
    renderCashFlow({ state, filteredTxs, utils, dom });
    renderBalanceSheet({ state, utils, dom });
    renderWishlist({ state, filterRange, constants: CONSTANTS, utils, dom });
    renderRetirement({ state, utils, dom });
  };

  const context = {
    dom,
    store,
    ui,
    constants: CONSTANTS,
    saveState,
    renderAll,
    renderWishlist: renderWishlistOnly,
  };
  const actions = createActions(context);

  doc.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const { action } = button.dataset;
    if (action === "tab") actions.switchTab(button.dataset.target);
    if (action === "set-tx-type") actions.setTxType(button.dataset.val);
    if (action === "add-custom-cat") actions.addCustomCat();
    if (action === "add-fund-cat") actions.addFundCategory();
    if (action === "edit-tx") actions.beginEditTx(button.dataset.id);
    if (action === "edit-repayment") actions.editAdvanceRepayment(button.dataset.id);
    if (action === "del-tx") actions.delTx(button.dataset.id);
    if (action === "repay-advance") actions.repayAdvance(button.dataset.id);
    if (action === "edit-bs") actions.beginEditBs(button.dataset.id, button.dataset.isacc === "true");
    if (action === "del-bs") actions.delBs(button.dataset.id, button.dataset.isacc === "true");
    if (action === "toggle-em") actions.toggleEm(button.dataset.id, button.dataset.isacc === "true");
    if (action === "del-cat-budget") actions.delCatBudget(button.dataset.cat);
    if (action === "edit-wish") actions.beginEditWish(button.dataset.id);
    if (action === "del-wish") actions.delWish(button.dataset.id);
    if (action === "mv-wish") actions.mvWish(button.dataset.id, Number(button.dataset.dir));
    if (action === "toggle-tbl") ui.toggleRetirementTable();
    if (action === "preset-ret") actions.presetRet(Number(button.dataset.r), Number(button.dataset.i));
    if (action === "del-fund") actions.delFund(button.dataset.id);
    if (action === "edit-fund") actions.beginEditFund(button.dataset.id);
    if (action === "topup-fund") actions.topupFund(button.dataset.id);
    if (action === "open-fund") actions.openFund(button.dataset.id);
    if (action === "export-data") {
      exportData(store.getState());
      toast.show("已匯出備份");
    }
    if (action === "trigger-import") dom.fileImport.click();
  });

  const bindForm = (id, callback) => {
    const form = $(id, doc);
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (form.checkValidity()) callback();
      else form.reportValidity();
    });
  };

  bindForm("form-tx", () => actions.addTx());
  bindForm("form-cat-bud", () => actions.setCatBudget());
  bindForm("form-wish", () => actions.addWish());
  bindForm("form-bs", () => actions.addBs());
  bindForm("form-fund", () => actions.addFund());

  dom.filterPreset.addEventListener("change", (event) => actions.setDatePreset(event.target.value));
  dom.filterStart.addEventListener("change", () => actions.customDate());
  dom.filterEnd.addEventListener("change", () => actions.customDate());
  dom.inputCategory.addEventListener("change", () => ui.populateTransactionSubcategoryOptions({ reset: true }));
  dom.balanceType.addEventListener("change", (event) => {
    dom.balanceCategoryWrap.classList.toggle("d-none", event.target.value !== "item");
  });
  dom.txCancelButton.addEventListener("click", () => actions.cancelEditTx());
  dom.fundCancelButton.addEventListener("click", () => actions.cancelEditFund());
  dom.bsCancelButton.addEventListener("click", () => actions.cancelEditBs());
  dom.wishCancelButton.addEventListener("click", () => actions.cancelEditWish());

  [
    dom.inputAmount,
    dom.inputOwnAmount,
    dom.budgetCapInput,
    dom.fundTarget,
    dom.fundMonthly,
    dom.balanceAmount,
    dom.catBudgetAmount,
    dom.wishPrice,
  ]
    .filter(Boolean)
    .forEach((node) => {
      node.addEventListener("change", () => {
        if (!node.value) return;
        node.value = String(toMoneyInt(node.value));
      });
    });

  dom.budgetCapInput.addEventListener("change", () => {
    store.update((state) => {
      state.settings.budgetCap = toMoneyInt(dom.budgetCapInput.value);
    });
    saveState();
    renderWishlistOnly();
  });
  dom.retireLinked.addEventListener("change", () => {
    store.update((state) => {
      state.settings.retLinked = dom.retireLinked.checked;
    });
    saveState();
    ui.toggleRetLinkUI();
    renderAll();
  });

  dom.authButton.addEventListener("click", async () => {
    if (!cloudSync.enabled || authAction) return;

    const wantsGoogleLogin = !currentUser || currentUser.isAnonymous;
    authAction = wantsGoogleLogin ? "signing-in" : "signing-out";
    ui.renderAuthState(currentUser, cloudSync.enabled, cloudSync.error);

    try {
      if (wantsGoogleLogin) {
        await cloudSync.signInWithGoogle();
        toast.show("Google 登入成功");
      } else {
        const result = await cloudSync.signOutToAnonymous();
        toast.show(result?.mode === "anonymous" ? "已登出並切回本機模式" : "已登出，目前僅保留本機資料");
      }
    } catch (error) {
      console.warn(`${wantsGoogleLogin ? "Sign-in" : "Sign-out"} action failed.`, error);
      toast.show(wantsGoogleLogin ? "登入失敗，請稍後再試" : "登出失敗，請稍後再試", "error");
    } finally {
      authAction = null;
      ui.renderAuthState(currentUser, cloudSync.enabled, cloudSync.error);
    }
  });

  ["currentAge", "retirementAge", "deathAge"].forEach((key) => {
    dom[key].addEventListener("input", () => renderAll());
  });

  [
    ["retireAsset", "retireAssetValue", (value) => formatMoney(toMoneyInt(value))],
    ["retireMonthly", "retireMonthlyValue", (value) => formatMoney(toMoneyInt(value))],
    ["retirePrincipalReturn", "retirePrincipalReturnValue", (value) => `${parseFloat(value).toFixed(1)}%`],
    ["retireContributionReturn", "retireContributionReturnValue", (value) => `${parseFloat(value).toFixed(1)}%`],
    ["retireInflation", "retireInflationValue", (value) => `${parseFloat(value).toFixed(1)}%`],
    ["retireWithdraw", "retireWithdrawValue", (value) => formatMoney(toMoneyInt(value))],
    ["retireTarget", "retireTargetValue", (value) => formatMoney(toMoneyInt(value))],
  ].forEach(([inputKey, outputKey, formatter]) => {
    dom[inputKey].addEventListener("input", (event) => {
      dom[outputKey].textContent = formatter(event.target.value);
      if (inputKey === "retireAsset" && !store.getState().settings.retLinked) {
        store.update((state) => {
          state.settings.retManualAsset = toMoneyInt(event.target.value);
        });
      }
      renderAll();
    });
  });

  dom.fileImport.addEventListener("change", async (event) => {
    if (!event.target.files?.length) return;

    try {
      const nextState = await importData(event.target.files[0]);
      store.replace(nextState);
      await saveState();
      ui.syncFromSettings();
      syncRetirementInputs();
      ui.renderTransactionCategorySelect();
      ui.populateCategoryBudgetOptions();
      ui.populateFundOptions();
      ui.syncTxType();
      renderAll();
      toast.show("已匯入資料");
    } catch (error) {
      toast.show(error.message === "invalid-schema" ? "匯入失敗：檔案格式不符合目前資料模型" : "匯入失敗，請確認 JSON 內容", "error");
    } finally {
      event.target.value = "";
    }
  });

  ui.updateCloudStatus("local");
  ui.syncFromSettings();
  syncRetirementInputs();
  ui.renderTransactionCategorySelect();
  ui.populateCategoryBudgetOptions();
  ui.populateFundOptions();
  ui.syncTxType();
  ui.setTransactionEditMode({ active: false });
  ui.setFundEditMode({ active: false });
  ui.setBalanceSheetEditMode({ active: false });
  ui.setWishEditMode({ active: false });
  ui.renderAuthState(currentUser, cloudSync.enabled, cloudSync.error);

  const now = new Date();
  dom.headerSub.textContent = `${now.getFullYear()} / ${now.getMonth() + 1}`;
  dom.inputDate.value = localDateStr(now);
  if (dom.fundStart && !dom.fundStart.value) dom.fundStart.value = localDateStr(now).slice(0, 7);
  actions.setDatePreset("month");
  actions.setTxType("expense");

  cloudSync = await createCloudSync({
    getState: () => store.getState(),
    onStatus: (status, meta) => ui.updateCloudStatus(status, meta),
    onUserChange: (user) => {
      currentUser = user;
      ui.renderAuthState(currentUser, true, "");
    },
    onRemoteState: (remoteState) => {
      const currentState = createInitialState();
      store.replace(normalizeFinanceStateMoney({
        ...currentState,
        ...remoteState,
        settings: { ...currentState.settings, ...(remoteState.settings || {}) },
      }));
      ui.syncFromSettings();
      syncRetirementInputs();
      ui.renderTransactionCategorySelect();
      ui.populateCategoryBudgetOptions();
      ui.populateFundOptions();
      ui.syncTxType();
      renderAll();
    },
  });

  ui.renderAuthState(cloudSync.getUser?.() || currentUser, cloudSync.enabled, cloudSync.error);

  window.addEventListener("online", () => ui.updateCloudStatus("online"));
  window.addEventListener("offline", () => ui.updateCloudStatus("offline"));

  renderAll();

  return { store, actions, renderAll };
}
