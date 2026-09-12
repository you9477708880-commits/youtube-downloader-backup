import { seedLegacyState, smokeDate, smokeMonth, waitFor, writeSmokeResult } from "./helpers.js";

export function prepareDesktopCoreLayoutScenario() {
  const seededState = {
    txs: [
      {
        id: "layout-income",
        type: "income",
        amount: 50000,
        desc: "Smoke 薪資",
        date: smokeDate,
        cat: "薪資",
        category: "薪資",
        subcategory: "本薪",
        acc: "bank",
      },
      {
        id: "layout-expense",
        type: "expense",
        amount: 1200,
        desc: "Smoke 很長很長的晚餐備註用來測試桌機列表是否仍然穩定",
        date: smokeDate,
        cat: "餐飲",
        category: "餐飲",
        subcategory: "晚餐",
        acc: "cash",
      },
    ],
    bsI: [{ id: "layout-asset", name: "Smoke 長期資產", amount: 120000, cat: "asset", isEm: false }],
    wishes: [{ id: "layout-wish", name: "Smoke 待購清單項目", price: 8800, cat: "3C / 電子" }],
    sinkingFunds: [
      {
        id: "layout-fund",
        name: "Smoke 大額準備",
        category: "3C",
        targetAmount: 30000,
        monthlyContribution: 5000,
        startMonth: smokeMonth,
        targetMonth: smokeMonth,
        carryoverEnabled: true,
        note: "版面測試",
        events: [],
      },
    ],
    accounts: [
      { id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 10000 },
      { id: "bank", name: "主要銀行帳戶", type: "asset", isEm: false, initialBalance: 200000 },
      { id: "card", name: "信用卡", type: "liability", isEm: false, initialBalance: -3000 },
    ],
    userCats: { income: [], expense: [] },
    settings: {
      budgetCap: 50000,
      catBudgets: { 餐飲: 8000 },
      leftoverMode: "manual",
      investingLabel: "投資 / 儲蓄",
      cashReserveLabel: "現金預留",
      retLinked: true,
      retManualAsset: 0,
    },
  };
  seedLegacyState(seededState);
}

export async function runDesktopCoreLayoutScenario() {
  try {
    const stylesheetLoaded = [...document.styleSheets].some((sheet) => String(sheet.href || "").includes("workspaces.css"));
    if (!stylesheetLoaded) {
      throw new Error("workspace-stylesheet-not-loaded");
    }

    if (!window.matchMedia("(min-width: 900px)").matches) {
      throw new Error("desktop-breakpoint-not-active");
    }

    const checks = [
      { target: "ov", section: "t-ov", workspace: ".ov-workspace", panes: [".ov-filter-zone", ".ov-metric-zone", ".ov-main-zone", ".ov-secondary-zone"] },
      { target: "lg", section: "t-lg", workspace: ".ledger-workspace", panes: [".ledger-form-pane", ".ledger-list-pane"] },
      {
        target: "wl",
        section: "t-wl",
        workspace: ".budget-workspace",
        panes: [".budget-goal-center-block", ".budget-allocation-block", ".budget-funds-block", ".budget-category-block", ".budget-wishlist-block"],
      },
      { target: "cf", section: "t-cf", workspace: ".cf-workspace", panes: [".cf-summary-pane", ".cf-detail-pane"] },
      { target: "bs", section: "t-bs", workspace: ".bs-workspace", panes: [".bs-form-pane", ".bs-report-pane"] },
      { target: "re", section: "t-re", workspace: ".re-workspace", panes: [".re-metric-zone", ".re-control-zone", ".re-preset-zone", ".re-table-zone"] },
    ];

    for (const check of checks) {
      document.querySelector(`[data-action="tab"][data-target="${check.target}"]`)?.click();
      await waitFor(() => document.getElementById(check.section)?.classList.contains("on"));

      const section = document.getElementById(check.section);
      const workspace = section.querySelector(check.workspace);
      if (!workspace) {
        throw new Error(`missing-workspace-${check.target}`);
      }

      for (const pane of check.panes) {
        if (!section.querySelector(pane)) {
          throw new Error(`missing-pane-${check.target}-${pane}`);
        }
      }

      const display = getComputedStyle(workspace).display;
      if (display !== "grid") {
        throw new Error(`workspace-not-grid-${check.target}-${display}`);
      }

      if (check.target === "ov") {
        for (const selector of [".ov-main-zone", ".ov-secondary-zone"]) {
          const pane = section.querySelector(selector);
          if (getComputedStyle(pane).minWidth !== "0px") {
            throw new Error(`overview-pane-cannot-shrink-${selector}`);
          }
          if (pane.scrollWidth > pane.clientWidth + 1) {
            throw new Error(`overview-pane-overflow-${selector}-${pane.scrollWidth}-${pane.clientWidth}`);
          }
        }
      }
    }

    document.querySelector('[data-action="tab"][data-target="re"]')?.click();
    await waitFor(() => (document.getElementById("r-scenarios")?.textContent || "").includes("情境比較"));
    const retirementScenarioText = document.getElementById("r-scenarios")?.textContent || "";
    if (!retirementScenarioText.includes("延後 3 年退休") || !retirementScenarioText.includes("每月提領減少 10%")) {
      throw new Error("retirement-scenarios-missing");
    }
    const guardrailPanel = document.getElementById("rg-panel");
    if (!(guardrailPanel?.textContent || "").includes("護欄年度檢查")) {
      throw new Error("retirement-guardrail-panel-missing");
    }
    await waitFor(() => (document.getElementById("rg-output")?.textContent || "").includes("本次提領來源順序"));
    const guardrailText = document.getElementById("rg-output")?.textContent || "";
    if (!guardrailText.includes("目前提領率") || !guardrailText.includes("投資組合內現金")) {
      throw new Error("retirement-guardrail-output-missing");
    }
    const stockReturn = document.getElementById("rg-stock-return");
    stockReturn.value = "20";
    stockReturn.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => (document.getElementById("rg-output")?.textContent || "").includes("股票 64.3%（超配 4.3%）"));
    const rebalancedText = document.getElementById("rg-output")?.textContent || "";
    if (!rebalancedText.includes("賣出上漲且超過目標配置的股票")) {
      throw new Error("retirement-return-did-not-trigger-rebalancing");
    }
    document.querySelector('[data-action="toggle-tbl"]')?.click();
    await waitFor(() => !document.getElementById("tbl-w").classList.contains("d-none"));

    writeSmokeResult("pass", "desktop workspaces render, retirement scenarios and guardrail source planning appear, and retirement table toggles");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

export function prepareMonthlyReviewScenario() {
  const seededState = {
    txs: [
      {
        id: "review-income",
        type: "income",
        amount: 50000,
        desc: "Smoke salary",
        date: smokeDate,
        cat: "薪資",
        category: "薪資",
        subcategory: "本薪",
        acc: "bank",
      },
      {
        id: "review-phone",
        type: "expense",
        amount: 20000,
        desc: "Smoke phone",
        date: smokeDate,
        cat: "大額支出",
        category: "大額支出",
        subcategory: "手機",
        acc: "bank",
        linkedFundId: "review-fund",
      },
    ],
    bsI: [],
    wishes: [],
    sinkingFunds: [
      {
        id: "review-fund",
        name: "Smoke phone fund",
        category: "大額支出",
        targetAmount: 30000,
        monthlyContribution: 5000,
        startMonth: smokeMonth,
        targetMonth: smokeMonth,
        carryoverEnabled: true,
        note: "",
        events: [{ id: "review-spend", type: "spend", amount: 12000, date: smokeDate, linkedTxId: "review-phone" }],
      },
    ],
    accounts: [
      { id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 10000 },
      { id: "bank", name: "銀行", type: "asset", isEm: false, initialBalance: 100000 },
    ],
    userCats: { income: [], expense: [] },
    settings: {
      budgetCap: 40000,
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

export async function runMonthlyReviewScenario() {
  try {
    document.querySelector('[data-action="tab"][data-target="ov"]')?.click();
    await waitFor(() => document.getElementById("t-ov")?.classList.contains("on"));
    await waitFor(() => (document.getElementById("monthly-review")?.textContent || "").includes("本月收入"));

    const text = document.getElementById("monthly-review")?.textContent || "";
    if (
      !text.includes("NT$ 50,000") ||
      !text.includes("NT$ 8,000") ||
      !text.includes("動用準備") ||
      !text.includes("與上期比較") ||
      !text.includes("只比較相同天數") ||
      !text.includes("主要預算使用來源") ||
      !text.includes("Smoke phone")
    ) {
      throw new Error(`monthly-review-content-missing: ${text}`);
    }
    if (text.includes("財務導航") || text.includes("本月自評")) {
      throw new Error("monthly-review-obsolete-self-assessment-still-visible");
    }

    const sourceTrigger = document.querySelector('#monthly-review [data-action="view-budget-source"]');
    sourceTrigger?.click();
    await waitFor(() => !document.getElementById("transaction-detail-modal").classList.contains("d-none"));
    if (!(document.getElementById("transaction-detail-body").textContent || "").includes("Smoke phone")) {
      throw new Error("monthly-review-source-detail-missing");
    }
    document.getElementById("transaction-detail-close").click();

    writeSmokeResult("pass", "monthly review stays concise while rendering traceable comparison and complete source details");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}
