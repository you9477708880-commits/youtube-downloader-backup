import { seedLegacyState, smokeDate, waitFor, writeSmokeResult } from "./helpers.js";

export function prepareDailyOperationsScenario() {
  seedLegacyState({
    txs: [
      ...Array.from({ length: 52 }, (_, index) => ({ id: `z-${index}`, type: "expense", amount: 1, date: smokeDate, category: "餐飲", subcategory: "點心", acc: "cash", desc: "分頁測試" })),
      { id: "a-source", type: "expense", amount: 180, date: smokeDate, category: "餐飲", subcategory: "午餐", acc: "cash", desc: `完整備註\n${"午餐日記細節。".repeat(100)}\n最後一行`, externalSource: "andromoney", externalId: "csv-source", externalUid: "csv-uid", externalTime: "12:00" },
      { id: "b-linked", type: "expense", amount: 300, date: smokeDate, category: "餐飲", acc: "cash", desc: "準備金關聯", linkedFundId: "fund" },
    ],
    bsI: [], wishes: [],
    sinkingFunds: [{ id: "fund", name: "測試準備", category: "餐飲", monthlyContribution: 0, targetAmount: 1000, startMonth: smokeDate.slice(0, 7), targetMonth: "", carryoverEnabled: true, events: [{ id: "spend", type: "spend", amount: 300, date: smokeDate, linkedTxId: "b-linked" }] }],
    accounts: [{ id: "cash", name: "現金", type: "asset", initialBalance: 10000, isEm: false }],
    userCats: { income: [], expense: [] },
    settings: { budgetCap: 20000, catBudgets: {}, leftoverMode: "manual", investingLabel: "投資", cashReserveLabel: "預備金", retLinked: true, retManualAsset: 0 },
  });
}

export async function runDailyOperationsScenario(app) {
  const originalConfirm = window.confirm;
  try {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const ledger = document.getElementById("a-tx");
    const modal = document.getElementById("transaction-detail-modal");
    const repeat = document.getElementById("transaction-detail-repeat");
    const form = document.getElementById("form-tx");
    const amount = document.getElementById("i-amt");
    const note = document.getElementById("i-desc");
    const original = structuredClone(app.store.getState().txs.find((tx) => tx.id === "a-source"));
    const beforeCount = app.store.getState().txs.length;
    for (const id of ["f-start", "f-end"]) {
      assert(document.getElementById(id).getBoundingClientRect().width >= 170, `${id}-date-clipped`);
    }
    document.querySelector('[data-action="tab"][data-target="lg"]').click();
    ledger.querySelector('[data-list-page="next"]').click();
    assert(ledger.textContent.includes("51–"), "daily-ledger-page-missing");
    const openSource = () => ledger.querySelector('[data-action="view-tx"][data-id="a-source"]').click();
    note.value = "既有未保存草稿";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    openSource();
    window.confirm = () => false;
    repeat.click();
    assert(!modal.classList.contains("d-none") && note.value === "既有未保存草稿", "repeat-discard-cancel-lost-draft");
    window.confirm = () => true;
    repeat.click();
    assert(modal.classList.contains("d-none"), "repeat-modal-not-closed");
    assert(document.activeElement === amount, "repeat-focus-not-new-form");
    assert(document.getElementById("tx-form-title").textContent === "新增交易", "repeat-still-editing-original");
    assert(document.getElementById("i-date").value === smokeDate, "repeat-date-not-today");
    assert(note.value === original.desc, "repeat-long-multiline-note-lost");
    assert(app.store.getState().txs.length === beforeCount, "repeat-prefill-wrote-record");
    document.getElementById("tx-cancel-btn").click();
    assert(app.store.getState().txs.length === beforeCount && amount.value === "", "repeat-cancel-wrote-record");
    assert(ledger.textContent.includes("51–"), "repeat-lost-ledger-page");
    openSource();
    repeat.click();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => app.store.getState().txs.length === beforeCount + 1);
    const next = app.store.getState().txs[0];
    assert(next.id !== original.id && next.desc === original.desc, "repeat-new-record-invalid");
    assert(!next.externalId && !next.externalSource && !next.externalUid && !next.externalTime && !next.linkedFundId, "repeat-copied-identity-or-link");
    assert(JSON.stringify(app.store.getState().txs.find((tx) => tx.id === original.id)) === JSON.stringify(original), "repeat-mutated-original");
    document.querySelector('[data-action="tab"][data-target="lg"]').click();
    ledger.querySelector('[data-action="view-tx"][data-id="b-linked"]').click();
    assert(repeat.classList.contains("d-none"), "repeat-visible-for-fund-linked-row");
    document.getElementById("transaction-detail-close").click();
    ledger.querySelector('[data-action="edit-tx"][data-id="a-source"]').click();
    ledger.querySelector('[data-action="del-tx"][data-id="a-source"]').click();
    assert(amount.value === "", "deleted-edit-kept-form");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    assert(!app.store.getState().txs.some((tx) => tx.id === "a-source"), "deleted-edit-resurrected");
    assert(app.store.getState().txs.length === beforeCount, "deleted-edit-created-new-row");
    assert(document.documentElement.scrollWidth <= window.innerWidth + 2, "daily-horizontal-overflow");
    writeSmokeResult("pass", "repeat draft/cancel/save, original identity and multiline note, double-submit guard, page/focus preservation, special-link restriction, and delete-active-edit passed");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  } finally {
    window.confirm = originalConfirm;
  }
}

// A same-origin iframe supplies an exact CSS viewport even when desktop Chrome
// enforces a minimum headless window width. Both apps remain cloud/PWA-disabled.
export const prepareDailyOperationsMobileScenario = prepareDailyOperationsScenario;
export async function runDailyOperationsMobileScenario() {
  try {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;inset:0;width:390px;height:844px;border:0;z-index:99999";
    frame.src = "/index.html?__smoke_runner=1&smoke=daily-operations";
    document.body.appendChild(frame);
    // Covered parent frames can stop receiving animation frames in headless mode.
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { clearInterval(poll); reject(new Error("mobile-frame-timeout")); }, 6000);
      const poll = setInterval(() => {
        if (frame.contentDocument?.getElementById("smoke-result")) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve();
        }
      }, 25);
    });
    const result = frame.contentDocument.getElementById("smoke-result");
    if (frame.contentWindow.innerWidth !== 390) throw new Error("mobile-viewport-not-390");
    if (result.dataset.status !== "pass") throw new Error(frame.contentDocument.getElementById("smoke-detail")?.textContent || "mobile-daily-operations-failed");
    writeSmokeResult("pass", "390px CSS viewport: daily operations, long note, form focus, pagination and no horizontal overflow passed");
  } catch (error) {
    writeSmokeResult("fail", error.message || "mobile-daily-operations-failed");
  }
}
