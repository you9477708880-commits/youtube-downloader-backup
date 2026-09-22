import assert from "node:assert/strict";
import { test } from "node:test";
import { createImportController } from "../src/app/controllers/import-controller.js";
import { createStore } from "../src/state/store.js";
import { createCommitState } from "../src/app/state-commit.js";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle(name, force) {
      if (force === undefined) {
        if (values.has(name)) values.delete(name);
        else values.add(name);
        return values.has(name);
      }
      if (force) values.add(name);
      else values.delete(name);
      return force;
    },
  };
}

function createHarness() {
  const initialState = {
    txs: [
      {
        id: "local-6542",
        type: "expense",
        amount: 99,
        date: "2025-11-03",
        acc: "cash",
        linkedFundId: "fund-meal",
        externalSource: "andromoney",
        externalId: "6542",
      },
    ],
    accounts: [
      { id: "cash", name: "現金", type: "asset", initialBalance: 1000 },
      { id: "bank", name: "台新銀行", type: "asset", initialBalance: 0 },
    ],
    sinkingFunds: [
      {
        id: "fund-meal",
        events: [
          { id: "event-linked", type: "spend", amount: 99, date: "2025-11-03", linkedTxId: "local-6542" },
          { id: "event-other", type: "topup", amount: 50, date: "2025-11-01" },
        ],
      },
    ],
    bsI: [],
    wishes: [],
    userCats: { income: [], expense: [] },
    settings: {},
  };
  const store = createStore(structuredClone(initialState));
  const accountSelects = [];
  const accountTypeSelects = [];
  const elements = {
    androMoneyModal: { classList: createClassList(["d-none"]) },
    androMoneySummary: { textContent: "" },
    androMoneyAccounts: {
      innerHTML: "",
      querySelectorAll: (selector) => selector.includes("account-type") ? accountTypeSelects : accountSelects,
    },
    androMoneyDuplicates: { classList: createClassList(["d-none"]) },
    androMoneyDuplicateMode: { value: "skip" },
    androMoneyPreview: { innerHTML: "" },
    androMoneyConfirm: {
      disabled: false,
      focus: () => { calls.focus += 1; },
    },
  };
  const calls = {
    commit: 0,
    replace: 0,
    persist: 0,
    refreshWhole: 0,
    refreshTransactions: 0,
    cloudWaits: 0,
    focus: 0,
    toasts: [],
    backupExports: [],
    downloads: [],
    parseOptions: [],
  };
  let backupResult = structuredClone(initialState);
  let backupError = null;
  let commitError = null;
  let cloudSaveResult = true;
  let nextAccountId = 1;
  let context = 0;
  let readGate = null;
  let cloudGate = null;
  let durableState = structuredClone(initialState);

  let importedTransactions = [
    {
      id: "am-6542",
      type: "expense",
      amount: 209,
      date: "2025-11-03",
      desc: "新午餐",
      cat: "餐飲",
      category: "餐飲",
      subcategory: "午餐",
      acc: "bank",
      externalSource: "andromoney",
      externalId: "6542",
    },
    {
      id: "am-6543",
      type: "income",
      amount: 1000,
      date: "2025-11-04",
      desc: "收入",
      cat: "一般收入",
      category: "一般收入",
      subcategory: "其他",
      acc: "bank",
      externalSource: "andromoney",
      externalId: "6543",
    },
  ];

  const parseAndroMoneyCsv = (_text, options = {}) => {
    calls.parseOptions.push(options);
    const accountNames = [...new Set(importedTransactions.flatMap((transaction) => {
      if (transaction.type === "transfer") {
        return [transaction.sourceFromAccountName, transaction.sourceToAccountName].filter(Boolean);
      }
      return [transaction.sourceAccountName || "台新銀行"];
    }))];
    return {
      accountNames,
      transactions: importedTransactions.map((transaction) => {
        const {
          sourceAccountName = "台新銀行",
          sourceFromAccountName,
          sourceToAccountName,
          ...imported
        } = transaction;
        if (transaction.type === "transfer") {
          if (!options.accountMap) return { ...imported, fromAcc: "", toAcc: "" };
          return {
            ...imported,
            fromAcc: options.accountMap[sourceFromAccountName] || "",
            toAcc: options.accountMap[sourceToAccountName] || "",
          };
        }
        if (!options.accountMap) return { ...imported, acc: "" };
        return { ...imported, acc: options.accountMap[sourceAccountName] || "" };
      }),
    };
  };

  const controller = createImportController({
    elements,
    store,
    toast: { show: (...args) => calls.toasts.push(args) },
    resetWholeStateControllers: () => {
      calls.replace += 1;
    },
    getContext: () => context,
    refreshWholeStateUi: () => { calls.refreshWhole += 1; },
    commitState: (mutator, { updateUi }) => {
      calls.commit += 1;
      return createCommitState({ store, normalizeState: (s) => s,
        persistLocal: (s) => {
          if (commitError) throw commitError;
          calls.persist++;
          durableState = structuredClone(s);
        }, enqueueCloud: () => {},
      })(mutator, { updateUi });
    },
    waitForCloudSave: async () => {
      calls.cloudWaits += 1;
      if (cloudGate) await cloudGate;
      return cloudSaveResult;
    },
    refreshTransactionUi: () => { calls.refreshTransactions += 1; },
    readBackupFile: async () => {
      if (readGate) await readGate;
      if (backupError) throw backupError;
      return structuredClone(backupResult);
    },
    exportBackupFile: (state) => calls.backupExports.push(state),
    readTextFile: async () => { if (readGate) await readGate; return "csv-content"; },
    parseAndroMoneyCsv,
    buildAndroMoneyCsv: (transactions, accounts) => `csv:${transactions.length}:${accounts.length}`,
    downloadTextFile: (details) => calls.downloads.push(details),
    formatMoney: (value) => `$${value}`,
    escapeHTML: (value) => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;"),
    createId: () => `imported-account-${nextAccountId++}`,
  });

  return {
    store,
    initialState,
    elements,
    accountSelects,
    accountTypeSelects,
    calls,
    controller,
    get importedTransactions() { return importedTransactions; },
    setBackupResult(value) { backupResult = value; },
    setBackupError(error) { backupError = error; },
    setCommitError(error) { commitError = error; },
    setCloudSaveResult(value) { cloudSaveResult = value; },
    setImportedTransactions(value) { importedTransactions = value; },
    switchContext() { context++; },
    setReadGate(value) { readGate = value; },
    setCloudGate(value) { cloudGate = value; },
    get durableState() { return durableState; },
  };
}

test("valid JSON backup replaces, persists, and refreshes the whole state once", async () => {
  const harness = createHarness();
  const replacement = { ...structuredClone(harness.initialState), txs: [] };
  harness.setBackupResult(replacement);

  await harness.controller.importBackupFile({ name: "backup.json" });

  assert.deepEqual(harness.store.getState(), replacement);
  assert.equal(harness.calls.replace, 1);
  assert.equal(harness.calls.persist, 1);
  assert.equal(harness.calls.refreshWhole, 1);
  assert.match(harness.calls.toasts.at(-1)[0], /已匯入資料並保存於本機/);
});

test("JSON persistence failure preserves original store, durable snapshot and controller drafts", async () => {
  const h = createHarness();
  const before = structuredClone(h.store.getState());
  h.setBackupResult({ ...before, txs: [] });
  h.setCommitError(new DOMException("full", "QuotaExceededError"));
  await assert.rejects(h.controller.importBackupFile({}), { name: "QuotaExceededError" });
  assert.deepEqual(h.store.getState(), before);
  assert.deepEqual(h.durableState, before);
  assert.equal(h.calls.replace, 0);
  assert.equal(h.calls.refreshWhole, 0);
  assert.equal(h.calls.toasts.length, 0);
});

test("JSON read cannot apply after UID ABA switch or whole-state controller reset", async () => {
  for (const invalidate of [(h) => { h.switchContext(); h.switchContext(); }, (h) => h.controller.reset()]) {
    const h = createHarness();
    let release;
    h.setReadGate(new Promise((resolve) => { release = resolve; }));
    const pending = h.controller.importBackupFile({});
    invalidate(h);
    release();
    await assert.rejects(pending, /stale-import-context/);
    assert.equal(h.calls.commit, 0);
    assert.equal(h.calls.replace, 0);
    assert.equal(h.calls.persist, 0);
  }
});

test("CSV read is discarded after UID ABA switch or controller reset", async () => {
  for (const invalidate of [(h) => { h.switchContext(); h.switchContext(); }, (h) => h.controller.reset()]) {
    const h = createHarness();
    let release;
    h.setReadGate(new Promise((resolve) => { release = resolve; }));
    const pending = h.controller.openAndroMoneyImport({});
    invalidate(h);
    release();
    await assert.rejects(pending, /stale-import-context/);
    assert.equal(h.calls.parseOptions.length, 0);
    assert.equal(h.calls.persist, 0);
    assert.equal(h.elements.androMoneyModal.classList.contains("d-none"), true);
  }
});

test("CSV cloud completion from an old context cannot notify the new user", async () => {
  const h = createHarness();
  await h.controller.openAndroMoneyImport({});
  let release;
  h.setCloudGate(new Promise((resolve) => { release = resolve; }));
  const pending = h.controller.confirmAndroMoneyImport();
  assert.equal(h.calls.persist, 1);
  h.switchContext();
  release();
  await pending;
  assert.equal(h.calls.toasts.length, 0);
});

test("invalid JSON backup leaves state unchanged and performs no persistence or refresh", async () => {
  const harness = createHarness();
  const original = structuredClone(harness.store.getState());
  harness.setBackupError(new Error("invalid-schema"));

  await assert.rejects(harness.controller.importBackupFile({ name: "bad.json" }), /invalid-schema/);

  assert.deepEqual(harness.store.getState(), original);
  assert.equal(harness.calls.replace, 0);
  assert.equal(harness.calls.persist, 0);
  assert.equal(harness.calls.refreshWhole, 0);
});

test("backup and CSV exports use the current state and preserve the AndroMoney download contract", () => {
  const harness = createHarness();

  harness.controller.exportBackup();
  harness.controller.exportAndroMoney();

  assert.equal(harness.calls.backupExports[0], harness.store.getState());
  assert.deepEqual(harness.calls.downloads, [{
    content: "csv:1:2",
    filename: "AndroMoney.csv",
    type: "text/csv;charset=utf-8",
  }]);
  assert.deepEqual(harness.calls.toasts.map((item) => item[0]), ["已匯出備份", "已匯出 AndroMoney CSV"]);
});

test("opening AndroMoney import shows duplicate preview and account mapping without changing state", async () => {
  const harness = createHarness();
  const original = structuredClone(harness.store.getState());

  await harness.controller.openAndroMoneyImport({ name: "AndroMoney.csv" });

  assert.deepEqual(harness.store.getState(), original);
  assert.match(harness.elements.androMoneySummary.textContent, /2 筆交易、1 個帳戶名稱/);
  assert.match(harness.elements.androMoneySummary.textContent, /1 筆看起來已匯入過/);
  assert.match(harness.elements.androMoneyPreview.innerHTML, /已存在/);
  assert.match(harness.elements.androMoneyPreview.innerHTML, /新午餐/);
  assert.match(harness.elements.androMoneyAccounts.innerHTML, /data-andromoney-account="台新銀行"/);
  assert.match(harness.elements.androMoneyAccounts.innerHTML, /value="bank" selected/);
  assert.doesNotMatch(harness.elements.androMoneySummary.textContent, /將建立/);
  assert.equal(harness.elements.androMoneyDuplicateMode.value, "repair-accounts");
  assert.equal(harness.elements.androMoneyModal.classList.contains("d-none"), false);
  assert.equal(harness.calls.focus, 1);
  assert.equal(harness.calls.commit, 0);
});

test("CSV import creates a missing account as an asset by default in the same commit as its transactions", async () => {
  const harness = createHarness();
  harness.store.update((state) => {
    state.accounts = state.accounts.filter((account) => account.id !== "bank");
  });
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({
    dataset: { andromoneyAccount: "台新銀行" },
    value: "__create_andromoney_account__",
  });
  harness.accountTypeSelects.push({
    dataset: { andromoneyAccountType: "台新銀行" },
    value: "asset",
  });

  await harness.controller.confirmAndroMoneyImport();

  const account = harness.store.getState().accounts.find((item) => item.id === "imported-account-1");
  const imported = harness.store.getState().txs.find((transaction) => transaction.externalId === "6543");
  const repaired = harness.store.getState().txs.find((transaction) => transaction.externalId === "6542");
  assert.deepEqual(account, {
    id: "imported-account-1",
    name: "台新銀行",
    type: "asset",
    isEm: false,
    initialBalance: 0,
  });
  assert.equal(imported.acc, account.id);
  assert.equal(repaired.acc, account.id);
  assert.equal(repaired.amount, 99);
  assert.equal(repaired.linkedFundId, "fund-meal");
  assert.equal(harness.store.getState().sinkingFunds[0].events.length, 2);
  assert.equal(harness.calls.commit, 1);
  assert.match(harness.calls.toasts.at(-1)[0], /修正 1 筆帳戶，建立 1 個帳戶/);
});

test("reimporting only duplicate rows can create a liability account and remap existing transactions without duplicating them", async () => {
  const harness = createHarness();
  harness.store.update((state) => {
    state.accounts = state.accounts.filter((account) => account.id !== "bank");
    state.txs.push({ ...harness.importedTransactions[1], id: "local-6543", acc: "cash" });
  });
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({
    dataset: { andromoneyAccount: "台新銀行" },
    value: "__create_andromoney_account__",
  });
  harness.accountTypeSelects.push({
    dataset: { andromoneyAccountType: "台新銀行" },
    value: "liability",
  });
  harness.elements.androMoneyDuplicateMode.value = "update";

  await harness.controller.confirmAndroMoneyImport();

  const state = harness.store.getState();
  const account = state.accounts.find((item) => item.id === "imported-account-1");
  assert.equal(account.type, "liability");
  assert.equal(account.initialBalance, 0);
  assert.equal(state.txs.length, 2);
  assert.deepEqual(state.txs.map((transaction) => transaction.id).sort(), ["local-6542", "local-6543"]);
  assert.ok(state.txs.every((transaction) => transaction.acc === account.id));
  assert.match(harness.calls.toasts.at(-1)[0], /已新增 0 筆、更新 2 筆，建立 1 個帳戶/);
});

test("skip mode does not create an orphan account used only by a skipped duplicate", async () => {
  const harness = createHarness();
  harness.setImportedTransactions([
    { ...harness.importedTransactions[0], sourceAccountName: "只在重複列" },
    { ...harness.importedTransactions[1], externalId: "new-cash", id: "am-new-cash", sourceAccountName: "現金" },
  ]);
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push(
    { dataset: { andromoneyAccount: "只在重複列" }, value: "__create_andromoney_account__" },
    { dataset: { andromoneyAccount: "現金" }, value: "cash" },
  );
  harness.accountTypeSelects.push({
    dataset: { andromoneyAccountType: "只在重複列" },
    value: "asset",
  });
  harness.elements.androMoneyDuplicateMode.value = "skip";

  await harness.controller.confirmAndroMoneyImport();

  const state = harness.store.getState();
  assert.equal(state.accounts.some((account) => account.name === "只在重複列"), false);
  assert.equal(state.txs.find((transaction) => transaction.externalId === "new-cash")?.acc, "cash");
  assert.doesNotMatch(harness.calls.toasts.at(-1)[0], /建立 .*帳戶/);
});

test("account-repair mode fixes 450 duplicate rows without changing transaction count, local IDs, or other fields", async () => {
  const harness = createHarness();
  const imported = Array.from({ length: 450 }, (_, index) => ({
    id: `am-bulk-${index}`,
    type: "expense",
    amount: index + 1,
    date: "2026-08-01",
    desc: `批次 ${index}`,
    cat: "測試",
    category: "測試",
    subcategory: "批次",
    acc: "",
    externalSource: "andromoney",
    externalId: `bulk-${index}`,
    sourceAccountName: "批次信用卡",
  }));
  harness.setImportedTransactions(imported);
  harness.store.update((state) => {
    state.accounts = state.accounts.filter((account) => account.id !== "bank");
    state.sinkingFunds = [];
    state.txs = imported.map(({ sourceAccountName: _sourceAccountName, ...transaction }, index) => ({
      ...transaction,
      id: `local-bulk-${index}`,
      acc: "cash",
      amount: 999999,
      desc: `保留本機內容 ${index}`,
    }));
  });
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({
    dataset: { andromoneyAccount: "批次信用卡" },
    value: "__create_andromoney_account__",
  });
  harness.accountTypeSelects.push({
    dataset: { andromoneyAccountType: "批次信用卡" },
    value: "liability",
  });
  harness.elements.androMoneyDuplicateMode.value = "repair-accounts";

  await harness.controller.confirmAndroMoneyImport();

  const state = harness.store.getState();
  const account = state.accounts.find((item) => item.name === "批次信用卡");
  assert.equal(state.txs.length, 450);
  assert.equal(account.type, "liability");
  assert.ok(state.txs.every((transaction, index) => transaction.id === `local-bulk-${index}`));
  assert.ok(state.txs.every((transaction) => transaction.acc === account.id));
  assert.ok(state.txs.every((transaction, index) => transaction.amount === 999999 && transaction.desc === `保留本機內容 ${index}`));
  assert.match(harness.calls.toasts.at(-1)[0], /已新增 0 筆、更新 0 筆，修正 450 筆帳戶，建立 1 個帳戶/);
});

test("account choice toggles the new-account type field", () => {
  const harness = createHarness();
  const toggles = [];
  const typeSelect = { disabled: true };
  const fields = { classList: { toggle: (...args) => toggles.push(args) } };
  const row = {
    querySelector: (selector) => selector.includes("new-account-fields") ? fields : typeSelect,
  };
  const select = {
    dataset: { andromoneyAccount: "台新銀行" },
    value: "__create_andromoney_account__",
    closest: () => row,
  };

  harness.controller.syncAndroMoneyAccountChoice(select);

  assert.deepEqual(toggles, [["d-none", false]]);
  assert.equal(typeSelect.disabled, false);
});

test("account-repair mode leaves a duplicate with a conflicting transaction type unchanged", async () => {
  const harness = createHarness();
  harness.setImportedTransactions([harness.importedTransactions[0]]);
  harness.store.update((state) => {
    state.txs[0].type = "income";
    state.txs[0].acc = "cash";
  });
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({ dataset: { andromoneyAccount: "台新銀行" }, value: "bank" });

  await harness.controller.confirmAndroMoneyImport();

  assert.equal(harness.calls.commit, 0);
  assert.equal(harness.store.getState().txs[0].type, "income");
  assert.equal(harness.store.getState().txs[0].acc, "cash");
  assert.match(harness.calls.toasts.at(-1)[0], /1 筆交易類型不同，未自動修改/);
});

test("CSV import rejects a transfer mapped to the same account before any state change", async () => {
  for (const duplicateMode of ["repair-accounts", "update"]) {
    const harness = createHarness();
    harness.setImportedTransactions([{
      id: "am-transfer-1",
      type: "transfer",
      amount: 500,
      date: "2026-08-01",
      desc: "信用卡繳款",
      externalSource: "andromoney",
      externalId: "transfer-1",
      sourceFromAccountName: "銀行帳戶",
      sourceToAccountName: "信用卡",
    }]);
    harness.store.update((state) => {
      state.txs = [{
        id: "local-transfer-1",
        type: "transfer",
        amount: 500,
        date: "2026-08-01",
        desc: "保留的本機轉帳",
        fromAcc: "cash",
        toAcc: "bank",
        externalSource: "andromoney",
        externalId: "transfer-1",
      }];
    });
    const original = structuredClone(harness.store.getState());
    await harness.controller.openAndroMoneyImport({});
    harness.accountSelects.push(
      { dataset: { andromoneyAccount: "銀行帳戶" }, value: "cash" },
      { dataset: { andromoneyAccount: "信用卡" }, value: "cash" },
    );
    harness.elements.androMoneyDuplicateMode.value = duplicateMode;

    await harness.controller.confirmAndroMoneyImport();

    assert.equal(harness.calls.commit, 0);
    assert.deepEqual(harness.store.getState(), original);
    assert.equal(harness.elements.androMoneyModal.classList.contains("d-none"), false);
    assert.match(harness.calls.toasts.at(-1)[0], /帳戶對應無效/);
  }
});

test("CSV skip adds only new transactions and reports the skipped duplicate", async () => {
  const harness = createHarness();
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({ dataset: { andromoneyAccount: "台新銀行" }, value: "bank" });
  harness.elements.androMoneyDuplicateMode.value = "skip";

  await harness.controller.confirmAndroMoneyImport();

  assert.equal(harness.calls.commit, 1);
  assert.equal(harness.calls.refreshTransactions, 1);
  assert.equal(harness.calls.cloudWaits, 1);
  assert.deepEqual(harness.store.getState().txs.map((transaction) => transaction.id), ["am-6543", "local-6542"]);
  assert.equal(harness.store.getState().sinkingFunds[0].events.length, 2);
  assert.match(harness.calls.toasts.at(-1)[0], /已新增 1 筆、更新 0 筆，略過 1 筆重複/);
  assert.match(harness.calls.toasts.at(-1)[0], /已同步雲端/);
  assert.equal(harness.elements.androMoneyModal.classList.contains("d-none"), true);
  assert.deepEqual(harness.calls.parseOptions.at(-1), { accountMap: { 台新銀行: "bank" } });
});

test("CSV update preserves the local transaction ID and atomically removes its old fund events", async () => {
  const harness = createHarness();
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({ dataset: { andromoneyAccount: "台新銀行" }, value: "bank" });
  harness.elements.androMoneyDuplicateMode.value = "update";

  await harness.controller.confirmAndroMoneyImport();

  assert.equal(harness.calls.commit, 1);
  const updated = harness.store.getState().txs.find((transaction) => transaction.externalId === "6542");
  assert.equal(updated.id, "local-6542");
  assert.equal(updated.amount, 209);
  assert.equal(updated.acc, "bank");
  assert.equal(updated.linkedFundId, undefined);
  assert.deepEqual(harness.store.getState().sinkingFunds[0].events.map((event) => event.id), ["event-other"]);
  assert.match(harness.calls.toasts.at(-1)[0], /已新增 1 筆、更新 1 筆/);
});

test("CSV matching and replacement retain the first existing and first imported duplicate", async () => {
  for (const mode of ["update", "repair-accounts"]) {
    const harness = createHarness();
    harness.store.update((state) => {
      state.txs.push({ ...state.txs[0], id: "second-local", amount: 88 });
    });
    harness.setImportedTransactions([
      { ...harness.importedTransactions[0], externalId: 6542, amount: 111 },
      { ...harness.importedTransactions[0], amount: 222, sourceAccountName: "現金" },
    ]);
    await harness.controller.openAndroMoneyImport({});
    harness.elements.androMoneyDuplicateMode.value = mode;
    await harness.controller.confirmAndroMoneyImport();
    const [first, second] = harness.store.getState().txs;
    assert.equal(first.id, "local-6542");
    assert.equal(first.acc, "bank");
    assert.equal(first.amount, mode === "update" ? 111 : 99);
    assert.equal(second.id, "second-local");
    assert.equal(second.acc, "cash");
    assert.equal(second.amount, 88);
  }
});

test("CSV matching keeps source and external ID boundaries, empty IDs, and input-only duplicates", async () => {
  const harness = createHarness();
  const base = harness.importedTransactions[0];
  harness.store.update((state) => {
    state.txs = [
      { ...base, id: "local-colon", externalSource: "a:b", externalId: "c" },
      { ...base, id: "local-zero", externalId: 0 },
    ];
  });
  harness.setImportedTransactions([
    { ...base, id: "new-colon", externalSource: "a", externalId: "b:c" },
    { ...base, id: "new-zero", externalId: 0 },
    { ...base, id: "new-first", externalId: "fresh" },
    { ...base, id: "new-second", externalId: "fresh" },
  ]);
  await harness.controller.openAndroMoneyImport({});
  harness.elements.androMoneyDuplicateMode.value = "update";
  await harness.controller.confirmAndroMoneyImport();
  assert.deepEqual(harness.store.getState().txs.map((tx) => tx.id), [
    "new-colon", "new-zero", "new-first", "new-second", "local-colon", "local-zero",
  ]);
});

test("CSV import reports local durability when cloud save is unavailable", async () => {
  const harness = createHarness();
  harness.setCloudSaveResult(false);
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({ dataset: { andromoneyAccount: "台新銀行" }, value: "bank" });

  await harness.controller.confirmAndroMoneyImport();

  assert.equal(harness.calls.cloudWaits, 1);
  assert.match(harness.calls.toasts.at(-1)[0], /已保存於本機/);
  assert.match(harness.calls.toasts.at(-1)[0], /尚未同步雲端/);
});

test("CSV with only skipped duplicates closes without committing", async () => {
  const harness = createHarness();
  harness.store.update((state) => {
    state.txs.push({
      ...harness.importedTransactions[1],
      id: "local-6543",
    });
  });
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({ dataset: { andromoneyAccount: "台新銀行" }, value: "bank" });
  harness.elements.androMoneyDuplicateMode.value = "skip";

  await harness.controller.confirmAndroMoneyImport();

  assert.equal(harness.calls.commit, 0);
  assert.equal(harness.calls.refreshTransactions, 0);
  assert.deepEqual(harness.calls.toasts.at(-1), ["沒有新的 AndroMoney 交易可匯入"]);
  assert.equal(harness.elements.androMoneyModal.classList.contains("d-none"), true);
});

test("failed CSV commit keeps the preview open and leaves state unchanged", async () => {
  const harness = createHarness();
  const original = structuredClone(harness.store.getState());
  await harness.controller.openAndroMoneyImport({});
  harness.accountSelects.push({ dataset: { andromoneyAccount: "台新銀行" }, value: "bank" });
  harness.setCommitError(new Error("persist-failed"));

  await assert.rejects(harness.controller.confirmAndroMoneyImport(), /persist-failed/);

  assert.deepEqual(harness.store.getState(), original);
  assert.equal(harness.calls.refreshTransactions, 0);
  assert.equal(harness.elements.androMoneyModal.classList.contains("d-none"), false);
});

test("cancel and lifecycle reset clear pending CSV state without changing finance data", async () => {
  const harness = createHarness();
  const original = structuredClone(harness.store.getState());

  await harness.controller.openAndroMoneyImport({});
  harness.controller.cancelAndroMoneyImport();
  await harness.controller.confirmAndroMoneyImport();
  await harness.controller.openAndroMoneyImport({});
  harness.controller.reset();
  await harness.controller.confirmAndroMoneyImport();

  assert.deepEqual(harness.store.getState(), original);
  assert.equal(harness.calls.commit, 0);
  assert.equal(harness.elements.androMoneyModal.classList.contains("d-none"), true);
  assert.equal(harness.elements.androMoneySummary.textContent, "");
  assert.equal(harness.elements.androMoneyPreview.innerHTML, "");
});
