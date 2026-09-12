import { seedLegacyState, smokeDate, waitFor, writeSmokeResult } from "./helpers.js";

export function prepareCategoryBudgetCleanupScenario() {
  const seededState = {
    txs: [{ id: "tx-history", type: "expense", amount: 1000, date: smokeDate, cat: "歷史自訂", category: "歷史自訂", subcategory: "未分類", acc: "cash" }],
    bsI: [],
    wishes: [],
    sinkingFunds: [],
    accounts: [
      { id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 10000 },
      { id: "bank", name: "銀行帳戶", type: "asset", isEm: false, initialBalance: 0 },
      { id: "card", name: "信用卡", type: "liability", isEm: false, initialBalance: 0 },
    ],
    userCats: { income: [], expense: ["仍在自訂"] },
    settings: {
      budgetCap: 50000,
      catBudgets: {
        餐飲: 5000,
        歷史自訂: 3000,
        仍在自訂: 2000,
        孤立分類: 1000,
      },
      leftoverMode: "manual",
      investingLabel: "股票 / 黃金",
      cashReserveLabel: "現金保留",
      retLinked: true,
      retManualAsset: 0,
    },
  };
  seedLegacyState(seededState);
}

export async function runCategoryBudgetCleanupScenario(app) {
  const originalConfirm = window.confirm;

  try {
    window.confirm = (message) => message.includes("孤立分類") && !message.includes("餐飲") && !message.includes("歷史自訂") && !message.includes("仍在自訂");
    document.querySelector('[data-action="tab"][data-target="wl"]')?.click();
    await waitFor(() => document.querySelector('[data-action="cleanup-cat-budgets"]'));
    document.querySelector('[data-action="cleanup-cat-budgets"]').click();
    await waitFor(() => !("孤立分類" in app.store.getState().settings.catBudgets));

    const budgets = app.store.getState().settings.catBudgets;
    const passed = budgets.餐飲 === 5000 && budgets.歷史自訂 === 3000 && budgets.仍在自訂 === 2000 && !("孤立分類" in budgets);
    if (!passed) {
      throw new Error("category-budget-cleanup-state-mismatch");
    }

    writeSmokeResult("pass", "unused category budget cleanup removed only orphaned budget");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  } finally {
    window.confirm = originalConfirm;
  }
}

export function prepareEditingCompletenessScenario() {
  const seededState = {
    txs: [],
    bsI: [{ id: "asset-smoke", name: "Smoke 資產", amount: 3000, cat: "asset", isEm: false }],
    wishes: [{ id: 901, name: "Smoke 舊待購", price: 1200, cat: "其他" }],
    sinkingFunds: [],
    accounts: [
      { id: "a1", name: "Smoke 帳戶", type: "asset", isEm: false, initialBalance: 1000 },
      { id: "a2", name: "台新銀行", type: "asset", isEm: false, initialBalance: 0 },
      { id: "a3", name: "信用卡", type: "liability", isEm: false, initialBalance: 0 },
    ],
    userCats: { income: [], expense: [] },
    settings: {
      budgetCap: 50000,
      catBudgets: {},
      leftoverMode: "manual",
      investingLabel: "投資 / 儲蓄",
      cashReserveLabel: "現金預留",
      retLinked: true,
      retManualAsset: 0,
    },
  };
  seedLegacyState(seededState);
}

export async function runEditingCompletenessScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="bs"]')?.click();
    await waitFor(() => document.querySelector('[data-action="edit-bs"][data-id="a1"]'));
    document.querySelector('[data-action="edit-bs"][data-id="a1"]').click();
    document.getElementById("bs-n").value = "Smoke 帳戶已改";
    document.getElementById("bs-a").value = "2500";
    document.getElementById("form-bs").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => app.store.getState().accounts.find((item) => item.id === "a1")?.name === "Smoke 帳戶已改");

    document.querySelector('[data-action="edit-bs"][data-id="asset-smoke"]').click();
    document.getElementById("bs-n").value = "Smoke 資產已改";
    document.getElementById("bs-a").value = "4500";
    document.getElementById("bs-c").value = "liability";
    document.getElementById("form-bs").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => app.store.getState().bsI.find((item) => item.id === "asset-smoke")?.amount === 4500);

    document.querySelector('[data-action="tab"][data-target="wl"]')?.click();
    await waitFor(() => document.querySelector('[data-action="edit-wish"][data-id="901"]'));
    document.querySelector('[data-action="edit-wish"][data-id="901"]').click();
    document.getElementById("w-name").value = "Smoke 新待購";
    document.getElementById("w-price").value = "1800";
    document.getElementById("w-cat").value = "娛樂";
    document.getElementById("form-wish").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => app.store.getState().wishes.find((item) => item.id === 901)?.name === "Smoke 新待購");

    const state = app.store.getState();
    const account = state.accounts.find((item) => item.id === "a1");
    const bsItem = state.bsI.find((item) => item.id === "asset-smoke");
    const wish = state.wishes.find((item) => item.id === 901);
    const passed =
      account?.name === "Smoke 帳戶已改" &&
      account?.initialBalance === 2500 &&
      bsItem?.name === "Smoke 資產已改" &&
      bsItem?.amount === 4500 &&
      bsItem?.cat === "liability" &&
      wish?.name === "Smoke 新待購" &&
      wish?.price === 1800 &&
      wish?.cat === "娛樂";

    if (!passed) {
      throw new Error("editing-completeness-state-mismatch");
    }

    writeSmokeResult("pass", "account, manual balance-sheet item, and wish edits all saved");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareConflictRecoveryCenterScenario() {
  // The dump-DOM smoke runner exits before asynchronous IndexedDB work can
  // settle. Repository and restore behavior are covered by dedicated tests;
  // this scenario protects the shipped UI surface and action wiring.
}

export async function runConflictRecoveryCenterScenario() {
  try {
    const trigger = document.querySelector('[data-action="open-recovery-center"]');
    const modal = document.getElementById("recovery-center-modal");
    const list = document.getElementById("recovery-center-list");
    const close = document.querySelector('[data-action="close-recovery-center"]');
    if (!trigger || !modal || !list || !close || !modal.textContent.includes("衝突復原中心")) {
      throw new Error("conflict-recovery-center-ui-missing");
    }
    writeSmokeResult("pass", "conflict recovery center UI and delegated actions are present; repository and selective restore tests cover IndexedDB behavior");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareAccountCenterScenario() {
  const seededState = {
    txs: [
      { id: "card-charge", type: "expense", amount: 1200, date: smokeDate, desc: "信用卡消費", category: "費用", cat: "費用", subcategory: "測試", acc: "card" },
      { id: "card-payment", type: "transfer", amount: 300, date: smokeDate, desc: "信用卡繳款", category: "轉帳", cat: "轉帳", subcategory: "繳款", fromAcc: "bank", toAcc: "card" },
    ],
    bsI: [],
    wishes: [],
    sinkingFunds: [],
    accounts: [
      { id: "bank", name: "主要銀行", type: "asset", isEm: false, initialBalance: 10000 },
      { id: "card", name: "測試信用卡", type: "liability", isEm: false, initialBalance: 0, creditLimit: 50000, statementDay: 5, paymentDueDay: 23 },
    ],
    userCats: { income: [], expense: [] },
    settings: { budgetCap: 20000, catBudgets: {}, leftoverMode: "manual", investingLabel: "投資", cashReserveLabel: "預備金", retLinked: true, retManualAsset: 0 },
  };
  seedLegacyState(seededState);
}

export async function runAccountCenterScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="bs"]')?.click();
    await waitFor(() => document.querySelector('#account-center [data-reconcile-input="card"]'));

    const center = document.getElementById("account-center");
    const card = [...center.querySelectorAll("details.account-card")]
      .find((node) => (node.textContent || "").includes("測試信用卡"));
    if (!card || !card.textContent.includes("目前欠款") || !card.textContent.includes("可用額度") || !card.textContent.includes("下次結帳")) {
      throw new Error("account-center-credit-card-summary-missing");
    }

    card.open = true;
    const input = card.querySelector('[data-reconcile-input="card"]');
    input.value = "-800";
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      card.querySelector('[data-action="reconcile-account"]')?.click();
    } finally {
      window.confirm = originalConfirm;
    }
    await waitFor(() => app.store.getState().txs.some((tx) => tx.type === "balance_adjustment" && tx.acc === "card"));
    const adjustment = app.store.getState().txs.find((tx) => tx.type === "balance_adjustment");
    if (adjustment.amount !== 100 || adjustment.direction !== "increase") {
      throw new Error("account-center-adjustment-mismatch");
    }
    document.querySelector(`[data-action="view-tx"][data-id="${adjustment.id}"]`)?.click();
    await waitFor(() => !document.getElementById("transaction-detail-modal")?.classList.contains("d-none"));
    const deleteAdjustment = document.getElementById("transaction-detail-delete");
    if (!deleteAdjustment || deleteAdjustment.classList.contains("d-none") || !deleteAdjustment.textContent.includes("刪除這筆帳戶調整")) {
      throw new Error("account-adjustment-direct-delete-missing");
    }
    const deleteConfirm = window.confirm;
    window.confirm = () => true;
    try {
      deleteAdjustment.click();
    } finally {
      window.confirm = deleteConfirm;
    }
    await waitFor(() => !app.store.getState().txs.some((tx) => tx.id === adjustment.id));
    if (!document.getElementById("transaction-detail-modal")?.classList.contains("d-none")) {
      throw new Error("account-adjustment-detail-stayed-open-after-delete");
    }

    document.getElementById("bs-account-type").value = "liability";
    document.getElementById("bs-account-type").dispatchEvent(new Event("change", { bubbles: true }));
    if (document.getElementById("bs-credit-fields").classList.contains("d-none")) {
      throw new Error("account-center-credit-fields-hidden");
    }

    writeSmokeResult("pass", "account and credit-card summaries, schedule settings, and confirmed traceable reconciliation passed");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}
