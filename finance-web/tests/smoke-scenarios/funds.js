import { seedLegacyState, smokeDate, smokeMonth, waitFor, writeSmokeResult } from "./helpers.js";

export function prepareFundShortfallChoiceScenario() {
  const seededState = {
    txs: [],
    bsI: [],
    wishes: [],
    sinkingFunds: [
      {
        id: "sf-smoke-phone",
        name: "Smoke 手機準備",
        category: "其他支出",
        targetAmount: 30000,
        monthlyContribution: 12000,
        startMonth: smokeMonth,
        targetMonth: smokeMonth,
        carryoverEnabled: true,
        note: "",
        events: [],
      },
    ],
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

export async function runFundShortfallChoiceScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="lg"]')?.click();
    document.getElementById("i-amt").value = "20000";
    document.getElementById("i-desc").value = "Smoke 手機";
    document.getElementById("i-date").value = smokeDate;
    document.getElementById("i-cat").value = "其他支出";
    document.getElementById("i-acc").value = "a2";
    document.getElementById("i-fund").value = "sf-smoke-phone";
    document.getElementById("form-tx").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => !document.getElementById("choice-modal").classList.contains("d-none"));

    const choices = [...document.querySelectorAll("#choice-modal [data-choice]")].map((button) => button.dataset.choice);
    const summary = document.getElementById("choice-summary").textContent || "";
    const hasExpectedChoices = ["topup", "partial", "unlink"].every((choice) => choices.includes(choice));
    const hasExpectedSummary = summary.includes("Smoke 手機準備") && summary.includes("NT$ 8,000");
    if (!hasExpectedChoices || !hasExpectedSummary) {
      throw new Error(`unexpected-modal choices=${choices.join(",")} summary=${summary}`);
    }

    document.querySelector('#choice-modal [data-choice="partial"]').click();
    await waitFor(() => document.getElementById("choice-modal").classList.contains("d-none"));
    await waitFor(() => app.store.getState().txs.length === 1);

    const state = app.store.getState();
    const tx = state.txs[0];
    const fund = state.sinkingFunds.find((item) => item.id === "sf-smoke-phone");
    const spend = fund?.events?.find((event) => event.type === "spend" && String(event.linkedTxId) === String(tx.id));
    const passed =
      tx?.linkedFundId === "sf-smoke-phone" &&
      tx?.amount === 20000 &&
      spend?.amount === 12000 &&
      !fund?.events?.some((event) => event.type === "topup");

    if (!passed) {
      throw new Error("partial-choice-state-mismatch");
    }

    writeSmokeResult("pass", "modal opened, all three choices rendered, partial payment selected, linked spend recorded");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareTransactionEditUnlinksScenario() {
  const seededState = {
    txs: [
      {
        id: 701,
        type: "expense",
        amount: 20000,
        desc: "Smoke 手機",
        date: smokeDate,
        cat: "其他支出",
        acc: "a2",
        linkedFundId: "sf-smoke-phone",
      },
    ],
    bsI: [],
    wishes: [],
    sinkingFunds: [
      {
        id: "sf-smoke-phone",
        name: "Smoke 手機準備",
        category: "其他支出",
        targetAmount: 30000,
        monthlyContribution: 12000,
        startMonth: smokeMonth,
        targetMonth: smokeMonth,
        carryoverEnabled: true,
        note: "",
        events: [
          { id: "tp-old", type: "topup", amount: 8000, date: smokeDate, linkedTxId: 701, note: "舊補差額" },
          { id: "sp-old", type: "spend", amount: 20000, date: smokeDate, linkedTxId: 701, note: "Smoke 手機" },
        ],
      },
    ],
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

export async function runTransactionEditUnlinksScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="lg"]')?.click();
    await waitFor(() => document.querySelector('[data-action="edit-tx"][data-id="701"]'));
    document.querySelector('[data-action="edit-tx"][data-id="701"]').click();
    await waitFor(() => document.getElementById("tx-form-title").textContent === "編輯交易");

    const note = document.getElementById("tx-edit-note").textContent || "";
    if (!note.includes("Smoke 手機準備")) {
      throw new Error("missing-linked-fund-edit-note");
    }

    document.getElementById("i-amt").value = "18000";
    document.getElementById("form-tx").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => app.store.getState().txs[0]?.amount === 18000);

    const state = app.store.getState();
    const tx = state.txs.find((item) => item.id === 701);
    const fund = state.sinkingFunds.find((item) => item.id === "sf-smoke-phone");
    const passed = tx?.amount === 18000 && !tx?.linkedFundId && (fund?.events || []).length === 0;
    if (!passed) {
      throw new Error("linked-events-not-cleared-after-edit");
    }

    writeSmokeResult("pass", "linked transaction edited, old fund link removed, old fund events cleared");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareFundEditRecalculatesScenario() {
  const seededState = {
    txs: [],
    bsI: [],
    wishes: [],
    sinkingFunds: [
      {
        id: "sf-smoke-trip",
        name: "Smoke 旅遊準備",
        category: "旅遊與行程",
        targetAmount: 48000,
        monthlyContribution: 2000,
        startMonth: smokeMonth,
        targetMonth: smokeMonth,
        carryoverEnabled: true,
        note: "原始設定",
        events: [{ id: "tp-manual", type: "topup", amount: 3000, date: smokeDate, note: "手動補入" }],
      },
    ],
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

export async function runFundEditRecalculatesScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="wl"]')?.click();
    await waitFor(() => document.querySelector('[data-action="edit-fund"][data-id="sf-smoke-trip"]'));
    document.querySelector('[data-action="edit-fund"][data-id="sf-smoke-trip"]').click();
    await waitFor(() => document.getElementById("fund-form-title").textContent.includes("編輯"));

    const note = document.getElementById("fund-edit-note").textContent || "";
    if (!note.includes("直接重算過去與未來的規劃提撥")) {
      throw new Error("missing-fund-edit-note");
    }

    document.getElementById("sf-name").value = "Smoke 旅遊準備更新";
    document.getElementById("sf-target").value = "50000";
    document.getElementById("sf-monthly").value = "50000";
    document.getElementById("sf-note").value = "更新後設定";
    document.getElementById("form-fund").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => app.store.getState().sinkingFunds[0]?.name === "Smoke 旅遊準備更新");

    const fund = app.store.getState().sinkingFunds.find((item) => item.id === "sf-smoke-trip");
    const card = document.querySelector('[data-fund-card="sf-smoke-trip"]');
    const passed =
      fund?.targetAmount === 50000 &&
      fund?.monthlyContribution === 50000 &&
      fund?.note === "更新後設定" &&
      fund?.events?.length === 1 &&
      fund?.events?.[0]?.id === "tp-manual" &&
      card?.textContent.includes("每月提撥 NT$ 50,000");

    if (!passed) {
      throw new Error("fund-edit-state-mismatch");
    }

    writeSmokeResult("pass", "fund edited, planning fields updated, historical events preserved, recalculation note shown");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareWishFundPrefillScenario() {
  const seededState = {
    txs: [],
    bsI: [],
    wishes: [{ id: "wish-camera", name: "Smoke camera", price: 18000, cat: "餐飲" }],
    sinkingFunds: [],
    accounts: [{ id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 30000 }],
    userCats: { income: [], expense: [] },
    settings: {
      budgetCap: 30000,
      catBudgets: {},
      leftoverMode: "manual",
      investingLabel: "投資",
      cashReserveLabel: "現金",
      retLinked: true,
      retManualAsset: 0,
    },
  };
  seedLegacyState(seededState);
}

export async function runWishFundPrefillScenario(app) {
  try {
    document.querySelector('[data-action="tab"][data-target="wl"]')?.click();
    await waitFor(() => document.getElementById("t-wl")?.classList.contains("on"));
    await waitFor(() => (document.getElementById("goal-center")?.textContent || "").includes("目標中心"));
    const goalDetails = document.querySelector("#goal-center .goal-center-details");
    if (!goalDetails || goalDetails.open) throw new Error("goal-center-progressive-disclosure-default-mismatch");
    goalDetails.open = true;

    document.querySelector('#goal-center [data-action="filter-goals"][data-filter="considering"]')?.click();
    await waitFor(() => document.querySelector('#goal-center [data-filter="considering"]')?.classList.contains("on"));
    await waitFor(() => document.querySelector('#goal-center [data-action="prepare-fund-from-wish"][data-id="wish-camera"]'));

    document.querySelector('#goal-center [data-action="prepare-fund-from-wish"][data-id="wish-camera"]')?.click();
    await waitFor(() => document.getElementById("sf-name")?.value === "Smoke camera");

    const fundName = document.getElementById("sf-name")?.value || "";
    const fundTarget = document.getElementById("sf-target")?.value || "";
    const fundMonthly = document.getElementById("sf-monthly")?.value || "";
    const fundCategory = document.getElementById("sf-cat")?.value || "";
    const fundNote = document.getElementById("sf-note")?.value || "";
    const fundCount = app.store.getState().sinkingFunds.length;

    if (
      fundName !== "Smoke camera" ||
      fundTarget !== "18000" ||
      fundMonthly !== "18000" ||
      fundCategory !== "餐飲" ||
      !fundNote.includes("Smoke camera") ||
      fundCount !== 0
    ) {
      throw new Error(
        `wish-fund-prefill-mismatch name=${fundName} target=${fundTarget} monthly=${fundMonthly} category=${fundCategory} fundCount=${fundCount}`,
      );
    }

    writeSmokeResult("pass", "goal center filters wishes and prefills the large-expense fund form without creating a fund");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}
