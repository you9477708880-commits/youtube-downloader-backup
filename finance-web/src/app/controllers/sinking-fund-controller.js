import { calculateBudgetData } from "../../domain/budget.js";
import { getFundTargetPlanStatus } from "../../domain/sinking-funds.js";
import { localDateStr, toMoneyInt } from "../../utils/format.js";

function defaultCreateId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeCssValue(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function buildMonthRange(date) {
  const month = String(date || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  const endDay = new Date(year, monthIndex, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDay).padStart(2, "0")}`,
  };
}

export function createSinkingFundController({
  elements,
  store,
  toast,
  setEditMode,
  commitState,
  renderWishlist,
  navigate,
  populateFundOptions,
  confirmAction = (message) => globalThis.window.confirm(message),
  promptInput = (message, defaultValue) => globalThis.window.prompt(message, defaultValue),
  createId = defaultCreateId,
  now = () => new Date(),
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
}) {
  const {
    root,
    name,
    category,
    target,
    monthly,
    start,
    targetMonth,
    note,
    carry,
  } = elements;
  let editingFundId = "";

  const reset = () => {
    editingFundId = "";
    name.value = "";
    target.value = "";
    monthly.value = "";
    targetMonth.value = "";
    note.value = "";
    carry.checked = true;
    setEditMode({ active: false });
  };

  const setCategoryIfAvailable = (categoryName) => {
    if (!categoryName) return false;
    const option = [...category.options].find(
      (item) => item.value === categoryName || item.textContent === categoryName,
    );
    if (!option) return false;
    category.value = option.value;
    return true;
  };

  const readFormValues = () => ({
    name: name.value.trim(),
    category: category.value,
    targetAmount: toMoneyInt(target.value),
    monthlyContribution: toMoneyInt(monthly.value),
    startMonth: start.value,
    targetMonth: targetMonth.value,
    carryoverEnabled: !!carry.checked,
    note: note.value.trim(),
  });

  const validateForm = (values, submitLabel) => {
    if (!values.name) {
      toast.show("請輸入準備項目名稱", "error");
      return false;
    }
    if (values.targetAmount <= 0) {
      toast.show("目標金額必須大於 0", "error");
      return false;
    }
    if (values.monthlyContribution <= 0) {
      toast.show("每月提撥必須大於 0", "error");
      return false;
    }
    if (!values.startMonth) {
      toast.show("請選擇開始月份", "error");
      return false;
    }
    if (values.targetMonth && values.targetMonth < values.startMonth) {
      toast.show("目標月份不能早於開始月份", "error");
      return false;
    }

    if (values.targetMonth) {
      const planStatus = getFundTargetPlanStatus(values);
      if (!planStatus.isFeasible) {
        const shouldContinue = confirmAction(
          `照目前設定，每月提撥 ${values.monthlyContribution}，到 ${values.targetMonth} 預計只能累積 ${planStatus.plannedAmount}。\n` +
            `距離目標 ${values.targetAmount} 還差 ${planStatus.shortfall}。\n\n` +
            "你可以延後目標月份、提高每月提撥，或之後用手動補入補足。\n\n" +
            `仍要${submitLabel}嗎？`,
        );
        if (!shouldContinue) return false;
      }
    }

    return true;
  };

  const addFund = () => {
    const values = readFormValues();
    if (!validateForm(values, editingFundId ? "儲存這個設定" : "先建立這個準備項目")) return;

    const wasEditing = !!editingFundId;
    commitState((draft) => {
      if (editingFundId) {
        const fund = draft.sinkingFunds.find((item) => item.id === editingFundId);
        if (!fund) return;
        Object.assign(fund, values);
      } else {
        draft.sinkingFunds.push({
          id: createId("sf"),
          ...values,
          events: [],
        });
      }
    }, {
      updateUi: () => {
        reset();
        populateFundOptions();
        renderWishlist();
      },
    });
    toast.show(wasEditing ? "已更新大額支出準備" : "已新增大額支出準備");
  };

  const beginEditFund = (id) => {
    const fund = store.getState().sinkingFunds.find((item) => item.id === id);
    if (!fund) {
      toast.show("找不到這個大額支出準備", "error");
      return;
    }

    editingFundId = id;
    navigate("wl");
    setEditMode({ active: true });
    name.value = fund.name || "";
    category.value = fund.category || "";
    target.value = fund.targetAmount ?? "";
    monthly.value = fund.monthlyContribution ?? "";
    start.value = fund.startMonth || "";
    targetMonth.value = fund.targetMonth || "";
    note.value = fund.note || "";
    carry.checked = !!fund.carryoverEnabled;
    root.getElementById("form-fund")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEditFund = () => {
    reset();
    toast.show("已取消編輯");
  };

  const delFund = (id) => {
    const fund = store.getState().sinkingFunds.find((item) => item.id === id);
    if (!fund) return;
    if (!confirmAction(`確定要刪除「${fund.name}」嗎？`)) return;

    commitState((draft) => {
      draft.sinkingFunds = draft.sinkingFunds.filter((item) => item.id !== id);
      draft.txs.forEach((tx) => {
        if (tx.linkedFundId === id) delete tx.linkedFundId;
      });
    }, {
      updateUi: () => {
        populateFundOptions();
        renderWishlist();
      },
    });
    toast.show("已刪除大額支出準備");
  };

  const topupFund = (id) => {
    const state = store.getState();
    const fund = state.sinkingFunds.find((item) => item.id === id);
    if (!fund) {
      toast.show("找不到這個大額支出準備", "error");
      return;
    }

    const rawAmount = promptInput(`這次要補入「${fund.name}」多少？`, String(fund.monthlyContribution || 0));
    if (rawAmount === null) return;
    const amount = toMoneyInt(rawAmount);
    if (amount <= 0) {
      toast.show("補入金額必須大於 0", "error");
      return;
    }

    const topupDate = localDateStr(now());
    const monthRange = buildMonthRange(topupDate);
    const budget = monthRange ? calculateBudgetData(state, monthRange) : null;
    const availableFreedom = budget?.freeToUse || 0;
    if (amount > availableFreedom) {
      toast.show(`本月可自由運用只有 ${availableFreedom}，這次最多只能補入 ${availableFreedom}。`, "error");
      return;
    }

    const topupNote = promptInput("這次補入要加備註嗎？可留空", "手動補入") ?? "";

    commitState((draft) => {
      const targetFund = draft.sinkingFunds.find((item) => item.id === id);
      if (!targetFund) return;
      if (!Array.isArray(targetFund.events)) targetFund.events = [];
      targetFund.events.push({
        id: createId("fe"),
        type: "topup",
        amount,
        date: topupDate,
        note: topupNote.trim(),
      });
    }, { updateUi: renderWishlist });
    toast.show("已補入準備項目");
  };

  const openFund = (id) => {
    const fund = store.getState().sinkingFunds.find((item) => item.id === id);
    if (!fund) {
      toast.show("找不到對應的大額支出準備", "error");
      return;
    }

    navigate("wl");
    renderWishlist();

    requestFrame(() => {
      const card = root.querySelector(`[data-fund-card="${escapeCssValue(id)}"]`);
      if (!card) return;
      card.open = true;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const prepareFundFromWish = (id) => {
    const wish = store.getState().wishes.find((item) => String(item.id) === String(id));
    if (!wish) {
      toast.show("找不到這個待購項目。", "error");
      return;
    }

    editingFundId = "";
    navigate("wl");
    setEditMode({ active: false });
    name.value = wish.name || "";
    target.value = wish.price ?? "";
    monthly.value = wish.price ?? "";
    start.value = start.value || localDateStr(now()).slice(0, 7);
    targetMonth.value = "";
    note.value = `由待購清單「${wish.name || "未命名項目"}」預填${wish.cat ? `，原分類：${wish.cat}` : ""}`;
    carry.checked = true;
    setCategoryIfAvailable(wish.cat);
    root.getElementById("form-fund")?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.show("已把待購項目帶入大額準備表單，請確認後再新增。");
  };

  return {
    addFund,
    beginEditFund,
    cancelEditFund,
    delFund,
    topupFund,
    openFund,
    prepareFundFromWish,
    reset,
  };
}
