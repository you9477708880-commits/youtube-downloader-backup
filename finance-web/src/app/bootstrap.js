import { CONSTANTS } from "../config/constants.js";
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
import { localDateStr, formatMoney, escapeHTML } from "../utils/format.js";
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
    inputAccount: $("i-acc", doc),
    inputFromAccount: $("i-from", doc),
    inputToAccount: $("i-to", doc),
    incomeButton: $("b-i", doc),
    expenseButton: $("b-e", doc),
    transferButton: $("b-t", doc),
    incomeExpenseAccountWrap: $("f-ie-acc", doc),
    categoryWrap: $("f-cat-group", doc),
    transferWrap: $("f-tr-acc", doc),
    oIncome: $("o-i", doc),
    oExpense: $("o-e", doc),
    oNet: $("o-n", doc),
    oBars: $("o-bars", doc),
    oTx: $("o-tx", doc),
    aTx: $("a-tx", doc),
    txCount: $("tx-cnt", doc),
    cashflowBody: $("cf-b", doc),
    balanceSheetBody: $("bs-b", doc),
    budgetCap: $("bs-cap", doc),
    budgetExpense: $("bs-exp", doc),
    budgetAvailable: $("bs-avail", doc),
    overviewFill: $("ov-fill", doc),
    overviewCapLabel: $("ov-cap-lbl", doc),
    overviewBudget: $("o-bud", doc),
    categoryBudgetList: $("cb-list", doc),
    wishList: $("wl-list", doc),
    budgetCapInput: $("bud-cap", doc),
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
  let cloudSync = { enabled: false, save: async () => {}, signInWithGoogle: async () => false, signOutToAnonymous: async () => ({ mode: "local" }) };
  let currentUser = null;
  let authAction = null;

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
      if (status === "error") {
        dom.cloudStatus.textContent = "⚠️ 同步異常";
        dom.cloudStatus.className = "cloud-st err";
        dom.cloudStatus.dataset.state = "error";
        return;
      }

      if (status === "syncing") {
        dom.cloudStatus.textContent = "☁️ 同步中...";
        dom.cloudStatus.className = "cloud-st";
        dom.cloudStatus.dataset.state = "syncing";
        return;
      }

      if (status === "online") {
        if (!navigator.onLine) {
          dom.cloudStatus.textContent = "☁️ 離線 (使用快取)";
          dom.cloudStatus.className = "cloud-st off";
          dom.cloudStatus.dataset.state = "offline";
          return;
        }

        if (meta?.fromCache) {
          dom.cloudStatus.textContent = "☁️ 已連線 (快取資料)";
          dom.cloudStatus.className = "cloud-st";
          dom.cloudStatus.dataset.state = "cache";
          return;
        }

        dom.cloudStatus.textContent = "☁️ 雲端同步";
        dom.cloudStatus.className = "cloud-st";
        dom.cloudStatus.dataset.state = "cloud";
        return;
      }

      if (status === "offline" || !navigator.onLine) {
        dom.cloudStatus.textContent = "☁️ 離線 (使用快取)";
        dom.cloudStatus.className = "cloud-st off";
        dom.cloudStatus.dataset.state = "offline";
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
        dom.headerTag.textContent = errorMessage ? `本機模式: ${errorMessage}` : "本機模式";
        dom.headerTag.dataset.state = "local";
        dom.headerTag.title = errorMessage || "目前資料只保存在這台裝置";
        return;
      }

      dom.authButton.disabled = authAction !== null;

      if (authAction === "signing-in") {
        dom.authButton.className = "auth-btn google";
        dom.authButton.textContent = "登入中...";
        dom.headerTag.textContent = "正在連線雲端";
        dom.headerTag.dataset.state = "pending";
        dom.headerTag.title = "正在將目前資料與雲端帳戶連接";
        return;
      }

      if (authAction === "signing-out") {
        dom.authButton.className = "auth-btn logout";
        dom.authButton.textContent = "登出中...";
        dom.headerTag.textContent = "正在切回匿名模式";
        dom.headerTag.dataset.state = "pending";
        dom.headerTag.title = "正在從 Google 帳戶切回匿名同步";
        return;
      }

      if (!user || user.isAnonymous) {
        dom.authButton.className = "auth-btn google";
        dom.authButton.textContent = "Google 登入綁定";
        dom.headerTag.textContent = "匿名模式";
        dom.headerTag.dataset.state = "anon";
        dom.headerTag.title = "目前可使用 Firebase 同步，但尚未綁定你的 Google 帳戶";
        return;
      }

      dom.authButton.className = "auth-btn logout";
      dom.authButton.textContent = "登出";
      dom.headerTag.textContent = `雲端: ${user.displayName || user.email || "Google 使用者"}`;
      dom.headerTag.dataset.state = "cloud";
      dom.headerTag.title = user.displayName || user.email || "已綁定 Google 帳戶";
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
      dom.tableToggleLabel.textContent = dom.tableWrap.classList.contains("d-none") ? "顯示表格" : "隱藏表格";
    },
    populateCategoryBudgetOptions() {
      const state = store.getState();
      const categories = [...CONSTANTS.expenseCategories, ...state.userCats.expense];
      dom.catBudgetCategory.innerHTML = categories.map((category) => `<option>${escapeHTML(category)}</option>`).join("");
    },
    renderTransactionCategorySelect() {
      const state = store.getState();
      if (state.txType === "transfer") return;
      const base = state.txType === "income" ? CONSTANTS.incomeCategories : CONSTANTS.expenseCategories;
      const categories = [...base, ...state.userCats[state.txType]];
      dom.inputCategory.innerHTML = categories.map((category) => `<option>${escapeHTML(category)}</option>`).join("");
    },
    syncTxType() {
      const { txType } = store.getState();
      dom.incomeButton.className = `tb${txType === "income" ? " on-inc" : ""}`;
      dom.expenseButton.className = `tb${txType === "expense" ? " on-exp" : ""}`;
      dom.transferButton.className = `tb${txType === "transfer" ? " on-trn" : ""}`;

      if (txType === "transfer") {
        dom.incomeExpenseAccountWrap.classList.add("d-none");
        dom.categoryWrap.classList.add("d-none");
        dom.transferWrap.classList.remove("d-none");
      } else {
        dom.incomeExpenseAccountWrap.classList.remove("d-none");
        dom.categoryWrap.classList.remove("d-none");
        dom.transferWrap.classList.add("d-none");
      }
    },
  };

  const saveState = async () => {
    saveLocalState(store.getState());
    if (cloudSync.enabled) {
      try {
        await cloudSync.save();
      } catch {
        ui.updateCloudStatus("error");
      }
    }
  };

  const getFiltered = () => getFilteredTransactions(store.getState(), getFilterRange(doc));
  const renderWishlistOnly = () =>
    renderWishlist({ state: store.getState(), filteredTxs: getFiltered(), constants: CONSTANTS, utils, dom });

  const renderAll = () => {
    const state = store.getState();
    const filteredTxs = getFiltered();
    renderOverview({ state, filteredTxs, constants: CONSTANTS, utils, dom });
    renderLedger({ state, filteredTxs, constants: CONSTANTS, utils, dom });
    renderCashFlow({ filteredTxs, utils, dom });
    renderBalanceSheet({ state, utils, dom });
    renderWishlist({ state, filteredTxs, constants: CONSTANTS, utils, dom });
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
    if (action === "del-tx") actions.delTx(Number(button.dataset.id));
    if (action === "del-bs") actions.delBs(button.dataset.id, button.dataset.isacc === "true");
    if (action === "toggle-em") actions.toggleEm(button.dataset.id, button.dataset.isacc === "true");
    if (action === "del-cat-budget") actions.delCatBudget(button.dataset.cat);
    if (action === "del-wish") actions.delWish(Number(button.dataset.id));
    if (action === "mv-wish") actions.mvWish(Number(button.dataset.id), Number(button.dataset.dir));
    if (action === "toggle-tbl") ui.toggleRetirementTable();
    if (action === "preset-ret") actions.presetRet(Number(button.dataset.r), Number(button.dataset.i));
    if (action === "export-data") {
      exportData(store.getState());
      toast.show("資料已匯出");
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

  dom.filterPreset.addEventListener("change", (event) => actions.setDatePreset(event.target.value));
  dom.filterStart.addEventListener("change", () => actions.customDate());
  dom.filterEnd.addEventListener("change", () => actions.customDate());
  dom.balanceType.addEventListener("change", (event) => {
    dom.balanceCategoryWrap.classList.toggle("d-none", event.target.value !== "item");
  });
  dom.budgetCapInput.addEventListener("change", () => {
    store.update((state) => {
      state.settings.budgetCap = Math.round(parseFloat(dom.budgetCapInput.value)) || 0;
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
        if (result?.mode === "anonymous") {
          toast.show("已登出，切回匿名模式");
        } else {
          toast.show("已登出，目前為本機模式");
        }
      }
    } catch (error) {
      console.warn(`${wantsGoogleLogin ? "Sign-in" : "Sign-out"} action failed.`, error);
      if (wantsGoogleLogin) {
        toast.show("登入失敗，請稍後再試或確認 Google 登入已啟用", "error");
      } else {
        toast.show("登出失敗，請稍後再試", "error");
      }
    } finally {
      authAction = null;
      ui.renderAuthState(currentUser, cloudSync.enabled, cloudSync.error);
    }
  });

  ["currentAge", "retirementAge", "deathAge"].forEach((key) => {
    dom[key].addEventListener("input", () => renderAll());
  });

  [
    ["retireAsset", "retireAssetValue", (value) => formatMoney(value)],
    ["retireMonthly", "retireMonthlyValue", (value) => formatMoney(value)],
    ["retirePrincipalReturn", "retirePrincipalReturnValue", (value) => `${parseFloat(value).toFixed(1)}%`],
    ["retireContributionReturn", "retireContributionReturnValue", (value) => `${parseFloat(value).toFixed(1)}%`],
    ["retireInflation", "retireInflationValue", (value) => `${parseFloat(value).toFixed(1)}%`],
    ["retireWithdraw", "retireWithdrawValue", (value) => formatMoney(value)],
    ["retireTarget", "retireTargetValue", (value) => formatMoney(value)],
  ].forEach(([inputKey, outputKey, formatter]) => {
    dom[inputKey].addEventListener("input", (event) => {
      dom[outputKey].textContent = formatter(event.target.value);
      if (inputKey === "retireAsset" && !store.getState().settings.retLinked) {
        store.update((state) => {
          state.settings.retManualAsset = parseFloat(event.target.value) || 0;
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
      ui.syncTxType();
      renderAll();
      toast.show("資料已匯入");
    } catch (error) {
      toast.show(error.message === "invalid-schema" ? "匯入失敗: 資料格式不正確" : "匯入失敗，請檢查 JSON 檔案", "error");
    } finally {
      event.target.value = "";
    }
  });

  ui.updateCloudStatus("local");
  ui.syncFromSettings();
  syncRetirementInputs();
  ui.renderTransactionCategorySelect();
  ui.populateCategoryBudgetOptions();
  ui.syncTxType();
  ui.renderAuthState(currentUser, cloudSync.enabled, cloudSync.error);

  const now = new Date();
  dom.headerSub.textContent = `${now.getFullYear()} / ${now.getMonth() + 1}`;
  dom.inputDate.value = localDateStr(now);
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
      store.replace({
        ...currentState,
        ...remoteState,
        settings: { ...currentState.settings, ...(remoteState.settings || {}) },
      });
      ui.syncFromSettings();
      syncRetirementInputs();
      ui.renderTransactionCategorySelect();
      ui.populateCategoryBudgetOptions();
      ui.syncTxType();
      renderAll();
    },
  });

  ui.renderAuthState(cloudSync.getUser?.() || currentUser, cloudSync.enabled, cloudSync.error);

  window.addEventListener("online", () => ui.updateCloudStatus("online"));
  window.addEventListener("offline", () => ui.updateCloudStatus("offline"));

  renderAll();

  return {
    store,
    actions,
    renderAll,
  };
}
