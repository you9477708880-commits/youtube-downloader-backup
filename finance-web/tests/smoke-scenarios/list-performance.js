import { seedLegacyState, localDateKey, smokeDate, waitFor, writeSmokeResult } from "./helpers.js";

export function prepareListPerformanceScenario() {
  const now = new Date();
  const olderDate = localDateKey(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  seedLegacyState({
    txs: [
      ...Array.from({ length: 125 }, (_, index) => ({ id: `page-${String(index).padStart(4, "0")}`, type: "expense", amount: 1, date: smokeDate, desc: `分頁測試 ${index}`, cat: "餐飲食品", category: "餐飲食品", subcategory: "測試", acc: "cash" })),
      { id: "outside-report", type: "expense", amount: 9, date: olderDate, desc: "較早期間特殊搜尋", cat: "餐飲食品", category: "餐飲食品", subcategory: "測試", acc: "bank" },
    ],
    bsI: [], wishes: [], sinkingFunds: [],
    accounts: [
      { id: "cash", name: "現金", type: "asset", initialBalance: 10000, isEm: false },
      { id: "bank", name: "銀行", type: "asset", initialBalance: 10000, isEm: false },
    ],
    userCats: { income: [], expense: [] },
    settings: { budgetCap: 20000, catBudgets: {}, leftoverMode: "manual", investingLabel: "投資", cashReserveLabel: "預備金", retLinked: true, retManualAsset: 0 },
  });
}

export async function runListPerformanceScenario(app) {
  try {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const ledger = document.getElementById("a-tx");
    const center = document.getElementById("account-center");
    document.querySelector('[data-action="tab"][data-target="lg"]').click();
    assert(ledger.querySelectorAll(".tx-row").length === 50, "ledger-first-page-not-bounded");
    assert(document.getElementById("tx-cnt").textContent === "125 筆", "ledger-total-count-was-paged");
    const overviewBeforeSearch = document.getElementById("o-tx").innerHTML;
    const accountSelect = document.getElementById("i-acc");
    accountSelect.value = "bank";
    const optionBefore = accountSelect.options[1];
    document.getElementById("i-desc").value = "未儲存的備註";
    ledger.querySelector('[data-list-page="next"]').click();
    assert(ledger.textContent.includes("51–100"), "ledger-next-page-missing");
    app.renderAll();
    assert(ledger.textContent.includes("51–100"), "ledger-page-lost-on-render");
    assert(accountSelect.value === "bank" && accountSelect.options[1] === optionBefore, "account-options-rebuilt-during-render");
    assert(document.getElementById("i-desc").value === "未儲存的備註", "unfinished-transaction-draft-lost");

    const query = document.getElementById("tx-search-query");
    query.value = "較早期間特殊搜尋";
    document.getElementById("tx-search-preset").value = "all";
    document.getElementById("tx-search-preset").dispatchEvent(new Event("change", { bubbles: true }));
    assert(document.getElementById("tx-cnt").textContent === "1 筆", "search-count-lost");
    assert(ledger.querySelector('[data-id="outside-report"]'), "search-history-not-visible");
    assert(document.getElementById("o-tx").innerHTML === overviewBeforeSearch, "search-mutated-overview-recent-transactions");
    document.getElementById("tx-search-clear").click();
    assert(ledger.textContent.includes("1–50"), "search-clear-did-not-reset-page");
    ledger.querySelector('[data-list-page="next"]').click();

    document.querySelector('[data-action="tab"][data-target="bs"]').click();
    assert(center.querySelectorAll('[data-action="view-tx"]').length === 0, "closed-account-history-rendered-eagerly");
    let card = center.querySelector('[data-account-card="cash"]');
    let history = card.querySelector("[data-account-transactions]");
    card.open = true;
    history.open = true;
    history.dispatchEvent(new Event("toggle"));
    assert(history.querySelectorAll('[data-action="view-tx"]').length === 50, "open-account-history-not-bounded");
    history.querySelector('[data-list-page="next"]').click();
    assert(history.textContent.includes("51–100"), "account-next-page-missing");
    const reconcile = card.querySelector("[data-reconcile-input]");
    reconcile.value = "1234";
    reconcile.focus();
    app.renderAll();
    card = center.querySelector('[data-account-card="cash"]');
    history = card.querySelector("[data-account-transactions]");
    assert(card.open && history.open && history.textContent.includes("51–100"), "account-open-page-lost-on-render");
    assert(card.querySelector("[data-reconcile-input]").value === "1234", "reconciliation-draft-lost-on-render");
    assert(document.activeElement === card.querySelector("[data-reconcile-input]"), "reconciliation-focus-lost-on-render");
    const ledgerNode = ledger.firstElementChild;
    const historyNode = history.querySelector('[data-action="view-tx"]');
    const retirementReturn = document.getElementById("rs2");
    retirementReturn.value = "10";
    retirementReturn.dispatchEvent(new Event("input", { bubbles: true }));
    assert(ledger.firstElementChild === ledgerNode, "retirement-input-rerendered-ledger");
    assert(history.querySelector('[data-action="view-tx"]') === historyNode, "retirement-input-rerendered-account-history");
    assert(document.getElementById("i-acc").value === "bank", "retirement-input-reset-account-selection");

    // JSON replacement exercises the same controller reset boundary as a UID change.
    const replacement = structuredClone(app.store.getState());
    replacement.txs = replacement.txs.filter((tx) => tx.acc === "cash").slice(0, 80);
    replacement.txs[0].desc = "whole-state-replacement";
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(replacement)], "isolated-list-test.json", { type: "application/json" }));
    const input = document.getElementById("file-import");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => app.store.getState().txs.some((tx) => tx.desc === "whole-state-replacement"));
    assert(ledger.textContent.includes("1–50"), "whole-state-replacement-kept-old-page");
    assert(!center.querySelector('[data-account-card="cash"]').open, "whole-state-replacement-kept-old-account-open");
    assert(center.querySelector('[data-reconcile-input="cash"]').value === "", "whole-state-replacement-kept-old-account-draft");
    assert(document.getElementById("i-acc").value === "cash", "whole-state-replacement-kept-old-account-selection");
    assert(center.querySelectorAll('[data-action="view-tx"]').length === 0, "whole-state-replacement-rendered-closed-history");
    writeSmokeResult("pass", "125-row ledger and account histories page at 50; totals, search/report isolation, draft and focus retention, retirement render boundary, and whole-state resets passed");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}
