import { seedLegacyState, smokeMonth, waitFor, writeSmokeResult } from "./helpers.js";

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
  seedLegacyState(seededState);
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
