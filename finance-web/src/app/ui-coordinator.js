import { CATEGORY_SUBCATEGORY_SUGGESTIONS, DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { setActiveTab } from "../ui/tabs.js";
import { escapeHTML, formatMoney } from "../utils/format.js";

export function createUiCoordinator({ runtime, dom, store, toast, doc = document, constants }) {
  let syncCoordinator = null;
  let retirementController = null;

  const ui = {
    toast,
    setActiveTab: (tabId) => setActiveTab(tabId, doc),
    updateCloudStatus(status, meta) {
      if (runtime.isAcceptance) {
        dom.cloudStatus.textContent = "🧪 驗收資料";
        dom.cloudStatus.className = "cloud-st off";
        dom.cloudStatus.dataset.state = "local";
        dom.cloudStatus.disabled = true;
        dom.cloudStatus.title = "本機驗收版使用獨立資料區，不連接正式雲端";
        dom.cloudStatus.setAttribute("aria-label", dom.cloudStatus.title);
        return;
      }
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
      if (runtime.isAcceptance) {
        dom.authButton.disabled = true;
        dom.authButton.className = "auth-btn";
        dom.authButton.textContent = "驗收版不提供登入";
        dom.headerTag.textContent = "驗收版｜僅本機";
        dom.headerTag.dataset.state = "local";
        dom.headerTag.title = "資料只保存在獨立驗收區，不會讀寫正式 Firebase。";
        return;
      }
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
          dom.choiceModal.querySelectorAll("[data-choice]").forEach((button) => button.removeEventListener("click", onChoice));
          dom.choiceCancel.removeEventListener("click", onCancel);
          resolve(choice);
        };
        const onChoice = (event) => close(event.currentTarget.dataset.choice);
        const onCancel = () => close("");
        dom.choiceModal.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", onChoice));
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
          dom.syncChoiceModal.querySelectorAll("[data-sync-choice]").forEach((button) => button.removeEventListener("click", onChoice));
          resolve(choice);
        };
        const onChoice = (event) => close(event.currentTarget.dataset.syncChoice);
        dom.syncChoiceModal.querySelectorAll("[data-sync-choice]").forEach((button) => button.addEventListener("click", onChoice));
        dom.syncChoiceModal.classList.remove("d-none");
        dom.syncChoiceModal.querySelector('[data-sync-choice="cancel"]')?.focus();
      });
    },
    populateCategoryBudgetOptions() {
      const state = store.getState();
      const categories = [...constants.expenseCategories, ...state.userCats.expense];
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
      const base = categoryType === "income" ? constants.incomeCategories : constants.expenseCategories;
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
      if (linkedFundName) notes.push(`這筆交易原本對應「${linkedFundName}」。儲存修改時會先移除舊的準備事件，請重新決定是否指定準備。`);
      if (advanceRepaidAmount > 0) notes.push(`這筆代墊已收回 ${formatMoney(advanceRepaidAmount)}；修改後的應收款不能低於已收金額。`);
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
      dom.bsEditNote.textContent = active && isAccount ? "帳戶可能已被交易引用；編輯會保留帳戶 ID 與歷史交易。改成負債帳戶不會自行改寫既有餘額。" : "";
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

  return {
    ui,
    bindSyncCoordinator(value) {
      syncCoordinator = value;
    },
    bindRetirementController(value) {
      retirementController = value;
    },
  };
}
