import { seedLegacyState, smokeDate, waitFor, writeSmokeResult } from "./helpers.js";

export function prepareTransactionSubcategoryScenario() {
  const seededState = {
    txs: [],
    bsI: [],
    wishes: [],
    sinkingFunds: [],
    accounts: [
      { id: "a1", name: "現金", type: "asset", isEm: false, initialBalance: 10000 },
      { id: "a2", name: "銀行帳戶", type: "asset", isEm: false, initialBalance: 0 },
      { id: "a3", name: "信用卡", type: "liability", isEm: false, initialBalance: 0 },
    ],
    userCats: { income: [], expense: [] },
    settings: {
      budgetCap: 50000,
      catBudgets: {},
      leftoverMode: "manual",
      investingLabel: "股票 / 黃金",
      cashReserveLabel: "現金保留",
      retLinked: true,
      retManualAsset: 0,
    },
  };
  seedLegacyState(seededState);
}

export async function runTransactionSubcategoryScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="lg"]')?.click();
    await waitFor(() => document.getElementById("i-subcat"));

    document.getElementById("i-cat").value = "餐飲";
    document.getElementById("i-subcat").value = "早餐";
    document.querySelector('[data-action="set-tx-type"][data-val="income"]').click();
    await waitFor(() => document.getElementById("i-subcat").value === "未分類");
    document.getElementById("i-subcat").value = "本薪";
    document.querySelector('[data-action="set-tx-type"][data-val="expense"]').click();
    await waitFor(() => document.getElementById("i-subcat").value === "未分類");
    document.getElementById("i-cat").value = "餐飲";
    document.getElementById("i-subcat").value = "早餐";
    document.getElementById("i-cat").value = "交通";
    document.getElementById("i-cat").dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => document.getElementById("i-subcat").value === "未分類");

    document.getElementById("i-amt").value = "180";
    document.getElementById("i-desc").value = "Smoke 午餐";
    document.getElementById("i-date").value = smokeDate;
    document.getElementById("i-cat").value = "餐飲";
    document.getElementById("i-subcat").value = "午餐";
    document.getElementById("i-acc").value = "a1";
    document.getElementById("form-tx").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => app.store.getState().txs.length === 1);
    let tx = app.store.getState().txs[0];
    const ledgerText = document.getElementById("a-tx")?.textContent || "";
    const passed = tx?.category === "餐飲" && tx?.subcategory === "午餐" && tx?.cat === "餐飲" && ledgerText.includes("餐飲 / 午餐");
    if (!passed) {
      throw new Error("transaction-subcategory-state-mismatch");
    }

    document.querySelector('[data-action="tab"][data-target="lg"]')?.click();
    await waitFor(() => document.querySelector(`[data-action="edit-tx"][data-id="${tx.id}"]`));
    document.querySelector(`[data-action="edit-tx"][data-id="${tx.id}"]`).click();
    await waitFor(() => document.getElementById("i-subcat")?.value === "午餐");
    document.getElementById("i-subcat").value = "晚餐";
    document.getElementById("form-tx").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => app.store.getState().txs[0]?.subcategory === "晚餐");
    tx = app.store.getState().txs[0];
    if (tx?.category !== "餐飲" || tx?.subcategory !== "晚餐") {
      throw new Error("transaction-subcategory-edit-mismatch");
    }

    writeSmokeResult("pass", "transaction subcategory saved, edited, and rendered");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareAdvanceEditGuardsScenario() {
  const seededState = {
    txs: [
      {
        id: 801,
        type: "advance",
        amount: 5000,
        ownAmount: 1000,
        receivableAmount: 4000,
        person: "Smoke 家人",
        desc: "Smoke 代墊",
        date: smokeDate,
        cat: "餐飲",
        acc: "a2",
      },
      {
        id: 802,
        type: "advance_repayment",
        advanceId: 801,
        amount: 2500,
        date: smokeDate,
        acc: "a2",
        cat: "代墊收款",
        desc: "Smoke 家人 還款",
        person: "Smoke 家人",
      },
    ],
    bsI: [],
    wishes: [],
    sinkingFunds: [],
    accounts: [
      { id: "a1", name: "現金", type: "asset", isEm: false, initialBalance: 0 },
      { id: "a2", name: "銀行帳戶", type: "asset", isEm: false, initialBalance: 50000 },
      { id: "a3", name: "信用卡", type: "liability", isEm: false, initialBalance: 0 },
    ],
    userCats: { income: [], expense: [] },
    settings: {
      budgetCap: 50000,
      catBudgets: {},
      leftoverMode: "manual",
      investingLabel: "股票 / 黃金",
      cashReserveLabel: "現金保留",
      retLinked: true,
      retManualAsset: 0,
    },
  };
  seedLegacyState(seededState);
}

export async function runAdvanceEditGuardsScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="lg"]')?.click();
    await waitFor(() => document.querySelector('[data-action="edit-tx"][data-id="801"]'));
    document.querySelector('[data-action="edit-tx"][data-id="801"]').click();
    await waitFor(() => document.getElementById("tx-form-title").textContent === "編輯交易");

    const note = document.getElementById("tx-edit-note").textContent || "";
    if (!note.includes("已收回 NT$ 2,500")) {
      throw new Error("missing-advance-edit-note");
    }

    document.getElementById("i-own").value = "3000";
    document.getElementById("form-tx").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (app.store.getState().txs.find((tx) => tx.id === 801)?.receivableAmount !== 4000) {
      throw new Error("invalid-advance-edit-was-saved");
    }

    document.getElementById("i-own").value = "2000";
    document.getElementById("form-tx").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => app.store.getState().txs.find((tx) => tx.id === 801)?.receivableAmount === 3000);

    writeSmokeResult("pass", "advance edit blocked below repaid total, then saved with a valid receivable amount");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareRepaymentEditScenario() {
  prepareAdvanceEditGuardsScenario();
}

export async function runRepaymentEditScenario(app) {
  const originalPrompt = window.prompt;

  try {
    document.querySelector('[data-action="tab"][data-target="lg"]')?.click();
    await waitFor(() => document.querySelector('[data-action="edit-repayment"][data-id="802"]'));

    const answers = ["3000", smokeDate, "1"];
    window.prompt = () => answers.shift() ?? null;
    document.querySelector('[data-action="edit-repayment"][data-id="802"]').click();
    await waitFor(() => app.store.getState().txs.find((tx) => tx.id === 802)?.amount === 3000);

    const repayment = app.store.getState().txs.find((tx) => tx.id === 802);
    const passed = repayment?.amount === 3000 && repayment?.date === smokeDate && repayment?.acc === "a1";
    if (!passed) {
      throw new Error("repayment-edit-state-mismatch");
    }

    writeSmokeResult("pass", "repayment edited within allowed receivable limit");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  } finally {
    window.prompt = originalPrompt;
  }
}
