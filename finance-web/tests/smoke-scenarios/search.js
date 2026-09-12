import { seedLegacyState, localDateKey, smokeMonth, writeSmokeResult } from "./helpers.js";

export function prepareTransactionSearchScenario() {
  const now = new Date();
  const dateMonthsAgo = (months) => localDateKey(new Date(now.getFullYear(), now.getMonth() - months, Math.min(now.getDate(), 12)));
  const seededState = {
    txs: [
      { id: "search-now", type: "expense", amount: 200, desc: "例行洗牙", date: localDateKey(now), category: "醫療", cat: "醫療", subcategory: "牙科", acc: "card" },
      { id: "search-five-months", type: "expense", amount: 150, desc: "洗牙與檢查", date: dateMonthsAgo(5), category: "醫療", cat: "醫療", subcategory: "牙科", acc: "cash" },
      { id: "search-eight-months", type: "expense", amount: 180, desc: "定期洗牙", date: dateMonthsAgo(8), category: "醫療", cat: "醫療", subcategory: "牙科", acc: "cash" },
    ],
    bsI: [],
    wishes: [{ id: "search-wish", name: "Smoke camera", price: 5000, cat: "3C" }],
    sinkingFunds: [{ id: "search-fund", name: "Smoke travel", category: "旅行", targetAmount: 12000, monthlyContribution: 1000, startMonth: smokeMonth, targetMonth: smokeMonth, carryoverEnabled: true, note: "", events: [] }],
    accounts: [
      { id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 10000 },
      { id: "card", name: "信用卡", type: "liability", isEm: false, initialBalance: 0 },
    ],
    userCats: { income: [], expense: [] },
    settings: { budgetCap: 20000, catBudgets: {}, leftoverMode: "manual", investingLabel: "投資", cashReserveLabel: "預備金", retLinked: true, retManualAsset: 0 },
  };
  seedLegacyState(seededState);
}

export async function runTransactionSearchScenario(app) {
  try {
    const reportStart = document.getElementById("f-start")?.value;
    const reportEnd = document.getElementById("f-end")?.value;

    document.querySelector('[data-action="tab"][data-target="wl"]')?.click();
    document.querySelector('#goal-center [data-action="filter-goals"][data-filter="considering"]')?.click();

    document.querySelector('[data-action="tab"][data-target="lg"]')?.click();
    const query = document.getElementById("tx-search-query");
    query.value = "醫療 洗牙";
    query.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("tx-search-preset")?.dispatchEvent(new Event("change", { bubbles: true }));

    if (
      !document.getElementById("tx-search-summary")?.textContent.includes("最近一次") ||
      !document.getElementById("tx-search-status")?.textContent.includes("不影響月度報表") ||
      document.getElementById("tx-cnt")?.textContent !== "2 筆" ||
      document.getElementById("f-start")?.value !== reportStart ||
      document.getElementById("f-end")?.value !== reportEnd ||
      document.getElementById("goal-center")?.dataset.filter !== "considering" ||
      app.store.getState().wishes.length !== 1 ||
      app.store.getState().sinkingFunds.length !== 1
    ) {
      throw new Error("transaction-search-mutated-report-or-goal-center");
    }

    const preset = document.getElementById("tx-search-preset");
    preset.value = "1y";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
    if (document.getElementById("tx-cnt")?.textContent !== "3 筆") throw new Error("transaction-search-one-year-mismatch");

    const reminderPanel = document.getElementById("life-reminder-panel");
    if (!reminderPanel || reminderPanel.open) throw new Error("life-reminder-not-collapsed-by-default");
    reminderPanel.open = true;
    document.getElementById("life-reminder-name").value = "半年洗牙";
    const reminderInterval = document.getElementById("life-reminder-interval");
    reminderInterval.value = "180";
    document.getElementById("life-reminder-due-soon").value = "14";
    document.getElementById("form-life-routine")?.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const routine = app.store.getState().lifeRoutines?.[0];
    const routineCard = document.querySelector("#life-routine-list .life-routine-card");
    if (!routine || routine.name !== "半年洗牙" || routine.query !== "醫療 洗牙" || !routineCard?.textContent.includes("半年洗牙")) {
      throw new Error("life-routine-save-or-render-missing");
    }
    if (!document.getElementById("life-reminder-heading")?.textContent.includes("1 項")) throw new Error("life-routine-heading-missing");
    if (document.getElementById("life-reminder-query") || document.getElementById("life-reminder-results")) {
      throw new Error("life-reminder-still-duplicates-search-results");
    }
    if (
      document.getElementById("f-start")?.value !== reportStart ||
      document.getElementById("f-end")?.value !== reportEnd ||
      document.getElementById("goal-center")?.dataset.filter !== "considering" ||
      app.store.getState().wishes.length !== 1 ||
      app.store.getState().sinkingFunds.length !== 1
    ) {
      throw new Error("life-reminder-mutated-report-or-goal-center");
    }

    document.getElementById("tx-search-clear")?.click();
    if (document.getElementById("tx-search-query")?.value !== "" || document.getElementById("tx-cnt")?.textContent !== "1 筆") {
      throw new Error("transaction-search-clear-mismatch");
    }

    writeSmokeResult("pass", "transaction search can save one synchronized life-cycle routine while reusing the existing result list and keeping report state isolated");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}
