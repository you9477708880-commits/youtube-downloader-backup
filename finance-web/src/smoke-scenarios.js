import { STORAGE_KEYS } from "./config/constants.js";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const smokeDate = localDateKey();
const smokeMonth = smokeDate.slice(0, 7);

function waitFor(check, timeoutMs = 3000) {
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }

      if (performance.now() - startedAt > timeoutMs) {
        reject(new Error("smoke-timeout"));
        return;
      }

      requestAnimationFrame(tick);
    };

    tick();
  });
}

function writeSmokeResult(status, detail) {
  const scenarioName = new URLSearchParams(window.location.search).get("smoke") || "unknown-scenario";
  let result = document.getElementById("smoke-result");
  if (!result) {
    result = document.createElement("div");
    result.id = "smoke-result";
    result.hidden = true;
    document.body.append(result);
  }

  result.dataset.status = status;
  result.textContent = `${status.toUpperCase()} ${scenarioName}`;

  let detailNode = document.getElementById("smoke-detail");
  if (!detailNode) {
    detailNode = document.createElement("div");
    detailNode.id = "smoke-detail";
    detailNode.hidden = true;
    document.body.append(detailNode);
  }
  detailNode.textContent = detail;
}

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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

export function prepareAndroMoneyImportScenario() {
  const seededState = {
    txs: [
      {
        id: "local-existing-6542",
        type: "expense",
        amount: 99,
        desc: "舊午餐",
        date: "2025-11-03",
        cat: "餐飲食品",
        category: "餐飲食品",
        subcategory: "早餐",
        acc: "cash",
        linkedFundId: "sf-smoke-csv",
        externalSource: "andromoney",
        externalId: "6542",
      },
    ],
    bsI: [],
    wishes: [],
    sinkingFunds: [
      {
        id: "sf-smoke-csv",
        name: "CSV 測試準備",
        category: "餐飲食品",
        targetAmount: 1000,
        monthlyContribution: 100,
        startMonth: smokeMonth,
        targetMonth: smokeMonth,
        carryoverEnabled: true,
        note: "",
        events: [{ id: "csv-spend", type: "spend", amount: 99, date: "2025-11-03", linkedTxId: "local-existing-6542" }],
      },
    ],
    accounts: [
      { id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 10000 },
      { id: "bank", name: "台新銀行", type: "asset", isEm: false, initialBalance: 0 },
      { id: "card", name: "信用卡", type: "liability", isEm: false, initialBalance: 0 },
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
}

export async function runAndroMoneyImportScenario(app) {
  try {
    const longDiaryNote = `汽車保養第一行\\n汽車保養第二行 ${"汽車保養與生活紀錄".repeat(60)}`;
    const csv = [
      '"Google Documents","理財幫手AndroMoney","20260518"',
      '"Id","幣別","金額","分類","子分類","日期","付款(轉出)","收款(轉入)","備註","Periodic","專案","商家(公司)","uid","時間"',
      '"6542","TWD","209","餐飲食品","午餐","20251103","台新銀行","","波奇波奇","","","","uid-meal","1202"',
      `"6543","TWD","1000","一般收入","其他","20251104","","新光銀行","${longDiaryNote}","","","","uid-income","1020"`,
      '"6544","TWD","800","交通","汽車保養","20251105","玉山信用卡","","刷卡保養","","","","uid-card","1810"',
    ].join("\n");
    const file = new File([csv], "AndroMoney.csv", { type: "text/csv" });
    const input = document.getElementById("file-andromoney-import");

    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => !document.getElementById("andromoney-modal").classList.contains("d-none"));
    const previewText = document.getElementById("andromoney-preview").textContent || "";
    const summaryText = document.getElementById("andromoney-summary").textContent || "";
    if (!previewText.includes("已存在") || !summaryText.includes("已匯入過")) {
      throw new Error("andromoney-duplicate-preview-missing");
    }
    const existingBankChoice = document.querySelector('[data-andromoney-account="台新銀行"]');
    const newBankChoice = document.querySelector('[data-andromoney-account="新光銀行"]');
    const newCardChoice = document.querySelector('[data-andromoney-account="玉山信用卡"]');
    const newCardType = document.querySelector('[data-andromoney-account-type="玉山信用卡"]');
    if (
      existingBankChoice?.value !== "bank" ||
      newBankChoice?.value !== "__create_andromoney_account__" ||
      newCardChoice?.value !== "__create_andromoney_account__"
    ) {
      throw new Error("andromoney-account-auto-mapping-mismatch");
    }
    newCardType.value = "liability";
    if (document.getElementById("andromoney-duplicate-mode").value !== "repair-accounts") {
      throw new Error("andromoney-account-repair-not-default");
    }
    document.getElementById("andromoney-confirm").click();
    await waitFor(() => app.store.getState().txs.length === 3);

    const [expense, income, cardExpense] = [...app.store.getState().txs].sort((a, b) => String(a.externalId).localeCompare(String(b.externalId)));
    const importedBank = app.store.getState().accounts.find((account) => account.name === "新光銀行");
    const importedCard = app.store.getState().accounts.find((account) => account.name === "玉山信用卡");
    const fund = app.store.getState().sinkingFunds.find((item) => item.id === "sf-smoke-csv");
    const appContent = document.querySelector(".app-content");
    const passed =
      expense?.type === "expense" &&
      expense?.id === "local-existing-6542" &&
      expense?.amount === 99 &&
      expense?.category === "餐飲食品" &&
      expense?.subcategory === "早餐" &&
      expense?.acc === "bank" &&
      expense?.linkedFundId === "sf-smoke-csv" &&
      expense?.externalSource === "andromoney" &&
      income?.type === "income" &&
      income?.acc === importedBank?.id &&
      income?.desc === longDiaryNote &&
      importedBank?.type === "asset" &&
      importedBank?.initialBalance === 0 &&
      importedCard?.type === "liability" &&
      importedCard?.initialBalance === 0 &&
      cardExpense?.type === "expense" &&
      cardExpense?.acc === importedCard?.id &&
      fund?.events?.some((event) => String(event.linkedTxId) === "local-existing-6542") &&
      document.getElementById("andromoney-modal").classList.contains("d-none") &&
      appContent.scrollWidth <= appContent.clientWidth + 1;

    if (!passed) {
      throw new Error("andromoney-import-state-mismatch");
    }

    const searchQuery = document.getElementById("tx-search-query");
    const searchPreset = document.getElementById("tx-search-preset");
    searchQuery.value = "汽車保養";
    searchQuery.dispatchEvent(new Event("input", { bubbles: true }));
    searchPreset.value = "all";
    searchPreset.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => [...document.querySelectorAll('#a-tx [data-action="view-tx"]')]
      .some((node) => node.dataset.id === String(income.id)));
    const detailTrigger = [...document.querySelectorAll('#a-tx [data-action="view-tx"]')]
      .find((node) => node.dataset.id === String(income.id));
    if (!detailTrigger) throw new Error("andromoney-detail-trigger-missing");
    detailTrigger?.click();
    if (document.getElementById("transaction-detail-modal").classList.contains("d-none")) {
      throw new Error("andromoney-detail-modal-not-open");
    }
    const detailText = document.getElementById("transaction-detail-body").textContent || "";
    if (!detailText.includes("汽車保養第一行") || !detailText.includes("汽車保養第二行")) {
      throw new Error("andromoney-full-detail-missing");
    }

    document.getElementById("transaction-detail-edit").click();
    await waitFor(() => Boolean(document.getElementById("transaction-detail-form")));
    const detailType = document.getElementById("transaction-detail-type");
    detailType.value = "expense";
    detailType.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("transaction-detail-account").value = "cash";
    document.getElementById("transaction-detail-category").value = "交通";
    document.getElementById("transaction-detail-subcategory").value = "汽車保養";
    document.getElementById("transaction-detail-description").value = `${longDiaryNote}（已從卡片修改）`;
    document.querySelector('[data-action="save-transaction-detail"]').click();
    await waitFor(() => {
      const updated = app.store.getState().txs.find((tx) => String(tx.id) === String(income.id));
      return updated?.type === "expense" && updated?.acc === "cash" && updated?.desc.endsWith("（已從卡片修改）");
    });
    const updated = app.store.getState().txs.find((tx) => String(tx.id) === String(income.id));
    if (updated?.externalSource !== "andromoney" || updated?.externalId !== income.externalId) {
      throw new Error("andromoney-detail-edit-lost-provenance");
    }
    if (!(document.getElementById("transaction-detail-body").textContent || "").includes("已從卡片修改")) {
      throw new Error("andromoney-detail-edit-view-not-refreshed");
    }
    document.getElementById("transaction-detail-close").click();
    if (!document.getElementById("transaction-detail-modal").classList.contains("d-none")) {
      throw new Error("andromoney-detail-modal-not-closed");
    }

    writeSmokeResult("pass", "AndroMoney account repair preserved local transaction fields and fund links while creating asset and liability accounts");
  } catch (error) {
    writeSmokeResult("fail", error.message || "unknown-error");
  }
}

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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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
    document.querySelector('[data-action="toggle-tbl"]')?.click();
    await waitFor(() => !document.getElementById("tbl-w").classList.contains("d-none"));

    writeSmokeResult("pass", "desktop workspaces render, retirement scenarios appear, and retirement table toggles");
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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
      !text.includes("財務導航") ||
      !text.includes("不評分，也不保存自評答案") ||
      !text.includes("與上期比較") ||
      !text.includes("只比較相同天數") ||
      !text.includes("主要預算使用來源") ||
      !text.includes("Smoke phone")
    ) {
      throw new Error(`monthly-review-content-missing: ${text}`);
    }

    const sourceTrigger = document.querySelector('#monthly-review [data-action="view-budget-source"]');
    sourceTrigger?.click();
    await waitFor(() => !document.getElementById("transaction-detail-modal").classList.contains("d-none"));
    if (!(document.getElementById("transaction-detail-body").textContent || "").includes("Smoke phone")) {
      throw new Error("monthly-review-source-detail-missing");
    }
    document.getElementById("transaction-detail-close").click();

    writeSmokeResult("pass", "monthly review renders financial navigation, traceable comparison, and complete source details");
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
}

export async function runTransactionSearchScenario() {
  try {
    const reportStart = document.getElementById("f-start")?.value;
    const reportEnd = document.getElementById("f-end")?.value;

    document.querySelector('[data-action="tab"][data-target="wl"]')?.click();
    document.querySelector('#goal-center [data-action="filter-goals"][data-filter="considering"]')?.click();
    const goalHtmlBefore = document.getElementById("goal-center")?.innerHTML;

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
      document.getElementById("goal-center")?.innerHTML !== goalHtmlBefore
    ) {
      throw new Error("transaction-search-mutated-report-or-goal-center");
    }

    const preset = document.getElementById("tx-search-preset");
    preset.value = "1y";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
    if (document.getElementById("tx-cnt")?.textContent !== "3 筆") throw new Error("transaction-search-one-year-mismatch");

    document.getElementById("tx-search-clear")?.click();
    if (document.getElementById("tx-search-query")?.value !== "" || document.getElementById("tx-cnt")?.textContent !== "1 筆") {
      throw new Error("transaction-search-clear-mismatch");
    }

    writeSmokeResult("pass", "independent transaction search periods, interval summary, clear behavior, and goal-center isolation all passed");
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

  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(seededState.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(seededState.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(seededState.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(seededState.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(seededState.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(seededState.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(seededState.settings));
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
