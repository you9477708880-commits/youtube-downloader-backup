import { withoutFundEventsLinkedToTransaction } from "../../domain/sinking-funds.js";

const CREATE_ACCOUNT_VALUE = "__create_andromoney_account__";

function defaultCreateId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeAccountName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function accountNameKey(value) {
  return normalizeAccountName(value).toLocaleLowerCase("zh-Hant");
}

function findMatchingAccount(accounts, name) {
  const key = accountNameKey(name);
  return accounts.find((account) => accountNameKey(account.name) === key) || null;
}

function sameExternalTransaction(left, right) {
  return Boolean(
    left?.externalSource &&
    right?.externalSource &&
    left.externalSource === right.externalSource &&
    String(left.externalId || "") !== "" &&
    String(left.externalId || "") === String(right.externalId || ""),
  );
}

function externalTransactionKey(transaction) {
  if (!transaction?.externalSource || !transaction?.externalId) return "";
  return `${transaction.externalSource}:${transaction.externalId}`;
}

function findExternalTransaction(existingTransactions, importedTransaction) {
  return existingTransactions.find((transaction) => sameExternalTransaction(transaction, importedTransaction)) || null;
}

function findDuplicateExternalTransactions(existingTransactions, importedTransactions) {
  const existingKeys = new Set(
    existingTransactions
      .filter((transaction) => transaction.externalSource && transaction.externalId)
      .map(externalTransactionKey),
  );
  return importedTransactions.filter((transaction) => existingKeys.has(externalTransactionKey(transaction)));
}

function repairTransactionAccount(existingTransaction, importedTransaction) {
  if (!existingTransaction || existingTransaction.type !== importedTransaction?.type) return null;
  if (importedTransaction.type === "transfer") {
    if (!importedTransaction.fromAcc || !importedTransaction.toAcc) return null;
    if (
      String(existingTransaction.fromAcc) === String(importedTransaction.fromAcc) &&
      String(existingTransaction.toAcc) === String(importedTransaction.toAcc)
    ) return null;
    return {
      ...existingTransaction,
      fromAcc: importedTransaction.fromAcc,
      toAcc: importedTransaction.toAcc,
    };
  }
  if (!["income", "expense"].includes(importedTransaction.type) || !importedTransaction.acc) return null;
  if (String(existingTransaction.acc) === String(importedTransaction.acc)) return null;
  return { ...existingTransaction, acc: importedTransaction.acc };
}

function hasValidImportedAccountMapping(transaction) {
  if (transaction?.type === "transfer") {
    return Boolean(
      transaction.fromAcc &&
      transaction.toAcc &&
      String(transaction.fromAcc) !== String(transaction.toAcc),
    );
  }
  return ["income", "expense"].includes(transaction?.type) && Boolean(transaction.acc);
}

export function createImportController({
  elements,
  store,
  toast,
  replaceWholeState,
  persistWholeState,
  refreshWholeStateUi,
  commitState,
  waitForCloudSave = async () => false,
  refreshTransactionUi,
  readBackupFile,
  exportBackupFile,
  readTextFile,
  parseAndroMoneyCsv,
  buildAndroMoneyCsv,
  downloadTextFile,
  formatMoney,
  escapeHTML,
  createId = defaultCreateId,
}) {
  const {
    androMoneyModal,
    androMoneySummary,
    androMoneyAccounts,
    androMoneyDuplicates,
    androMoneyDuplicateMode,
    androMoneyPreview,
    androMoneyConfirm,
  } = elements;
  let pendingAndroMoneyText = "";

  const reset = () => {
    pendingAndroMoneyText = "";
    androMoneyModal.classList.add("d-none");
    androMoneyAccounts.innerHTML = "";
    androMoneyPreview.innerHTML = "";
    androMoneySummary.textContent = "";
    androMoneyDuplicates.classList.add("d-none");
    androMoneyDuplicateMode.value = "repair-accounts";
  };

  const showAndroMoneyImportDialog = (parsed) => {
    const state = store.getState();
    const duplicates = findDuplicateExternalTransactions(state.txs, parsed.transactions);
    const duplicateKeys = new Set(duplicates.map(externalTransactionKey));
    const matchedAccountCount = parsed.accountNames.filter((name) => findMatchingAccount(state.accounts, name)).length;
    const newAccountCount = parsed.accountNames.length - matchedAccountCount;

    androMoneySummary.textContent =
      `讀到 ${parsed.transactions.length} 筆交易、${parsed.accountNames.length} 個帳戶名稱。` +
      (matchedAccountCount ? ` 已自動對應 ${matchedAccountCount} 個既有帳戶。` : "") +
      (newAccountCount ? ` 將建立 ${newAccountCount} 個缺少的帳戶。` : "") +
      (duplicates.length ? ` 其中 ${duplicates.length} 筆看起來已匯入過。` : "");
    androMoneyDuplicates.classList.toggle("d-none", duplicates.length === 0);
    androMoneyDuplicateMode.value = duplicates.length ? "repair-accounts" : "skip";
    androMoneyAccounts.innerHTML = parsed.accountNames.length
      ? parsed.accountNames
          .map(
            (name) => {
              const matchingAccount = findMatchingAccount(state.accounts, name);
              const accountOptions = state.accounts
                .map((account) => {
                  const label = account.type === "liability" ? `${account.name}（負債）` : account.name;
                  return `<option value="${escapeHTML(account.id)}"${matchingAccount?.id === account.id ? " selected" : ""}>${escapeHTML(label)}</option>`;
                })
                .join("");
              const creating = !matchingAccount;
              return `
                <div class="andromoney-account-row" data-andromoney-account-row>
                  <div class="flb">CSV 帳戶：${escapeHTML(name)}</div>
                  <div class="andromoney-account-fields">
                    <label class="flex-col gap-1">
                      <span class="text-xs text-gray">匯入方式</span>
                      <select data-andromoney-account="${escapeHTML(name)}">
                        ${accountOptions}
                        <option value="${CREATE_ACCOUNT_VALUE}"${creating ? " selected" : ""}>建立新帳戶「${escapeHTML(name)}」</option>
                      </select>
                    </label>
                    <label class="flex-col gap-1${creating ? "" : " d-none"}" data-andromoney-new-account-fields>
                      <span class="text-xs text-gray">新帳戶類型</span>
                      <select data-andromoney-account-type="${escapeHTML(name)}"${creating ? "" : " disabled"}>
                        <option value="asset" selected>資產（現金／銀行／電子支付）</option>
                        <option value="liability">負債（信用卡）</option>
                      </select>
                    </label>
                  </div>
                </div>
              `;
            },
          )
          .join("")
      : '<div class="empty">CSV 裡沒有可對應的帳戶名稱。</div>';
    androMoneyPreview.innerHTML = parsed.transactions.length
      ? parsed.transactions
          .slice(0, 6)
          .map((transaction) => {
            const duplicate = duplicateKeys.has(externalTransactionKey(transaction));
            return `
              <div class="detail-row">
                <div class="detail-main">
                  <div class="detail-title">${escapeHTML(transaction.category)} / ${escapeHTML(transaction.subcategory)}${duplicate ? "｜已存在" : "｜新增"}</div>
                  <div class="detail-sub">${escapeHTML(transaction.date)}｜${escapeHTML(transaction.desc || "無備註")}｜${transaction.type}</div>
                </div>
                <div class="detail-amt">${formatMoney(transaction.amount)}</div>
              </div>
            `;
          })
          .join("")
      : '<div class="empty detail-empty">沒有可匯入的交易。</div>';
    androMoneyConfirm.disabled = parsed.transactions.length === 0 || parsed.accountNames.length === 0;
    androMoneyModal.classList.remove("d-none");
    androMoneyConfirm.focus?.();
  };

  const syncAndroMoneyAccountChoice = (select) => {
    if (!select?.dataset?.andromoneyAccount) return;
    const row = select.closest?.("[data-andromoney-account-row]");
    const fields = row?.querySelector?.("[data-andromoney-new-account-fields]");
    const typeSelect = row?.querySelector?.("[data-andromoney-account-type]");
    const creating = select.value === CREATE_ACCOUNT_VALUE;
    fields?.classList?.toggle("d-none", !creating);
    if (typeSelect) typeSelect.disabled = !creating;
  };

  const readAndroMoneyAccountChoices = () => {
    const typeByName = new Map(
      [...androMoneyAccounts.querySelectorAll("[data-andromoney-account-type]")]
        .map((select) => [select.dataset.andromoneyAccountType, select.value]),
    );
    return new Map(
      [...androMoneyAccounts.querySelectorAll("[data-andromoney-account]")]
        .map((select) => [select.dataset.andromoneyAccount, {
          accountId: select.value,
          type: typeByName.get(select.dataset.andromoneyAccount) === "liability" ? "liability" : "asset",
        }]),
    );
  };

  const buildAccountImportPlan = (accountNames) => {
    const state = store.getState();
    const choices = readAndroMoneyAccountChoices();
    const accountMapEntries = [];
    const newAccounts = [];

    accountNames.forEach((name) => {
      const choice = choices.get(name);
      const selectedAccount = state.accounts.find((account) => String(account.id) === String(choice?.accountId));
      if (selectedAccount) {
        accountMapEntries.push([name, selectedAccount.id]);
        return;
      }

      const fallbackMatch = choice ? null : findMatchingAccount(state.accounts, name);
      if (fallbackMatch) {
        accountMapEntries.push([name, fallbackMatch.id]);
        return;
      }

      const account = {
        id: createId("a"),
        name: normalizeAccountName(name),
        type: choice?.type === "liability" ? "liability" : "asset",
        isEm: false,
        initialBalance: 0,
      };
      newAccounts.push(account);
      accountMapEntries.push([name, account.id]);
    });

    return { accountMap: Object.fromEntries(accountMapEntries), newAccounts };
  };

  const exportBackup = () => {
    exportBackupFile(store.getState());
    toast.show("已匯出備份");
  };

  const importBackupFile = async (file) => {
    const nextState = await readBackupFile(file);
    replaceWholeState(nextState);
    persistWholeState();
    refreshWholeStateUi();
    toast.show("已匯入資料");
  };

  const exportAndroMoney = () => {
    const state = store.getState();
    const csv = buildAndroMoneyCsv(state.txs, state.accounts);
    downloadTextFile({
      content: csv,
      filename: "AndroMoney.csv",
      type: "text/csv;charset=utf-8",
    });
    toast.show("已匯出 AndroMoney CSV");
  };

  const openAndroMoneyImport = async (file) => {
    pendingAndroMoneyText = await readTextFile(file);
    const parsed = parseAndroMoneyCsv(pendingAndroMoneyText);
    showAndroMoneyImportDialog(parsed);
  };

  const confirmAndroMoneyImport = async () => {
    if (!pendingAndroMoneyText) return;

    const initialParse = parseAndroMoneyCsv(pendingAndroMoneyText);
    const { accountMap, newAccounts: plannedAccounts } = buildAccountImportPlan(initialParse.accountNames);
    const parsed = parseAndroMoneyCsv(pendingAndroMoneyText, { accountMap });
    const invalidAccountMappingCount = parsed.transactions.filter(
      (transaction) => !hasValidImportedAccountMapping(transaction),
    ).length;
    if (invalidAccountMappingCount) {
      toast.show(
        `有 ${invalidAccountMappingCount} 筆交易的帳戶對應無效；每筆交易都需要有效帳戶，且轉帳的轉出與轉入帳戶不可相同，請調整後再確認`,
        "error",
      );
      return;
    }
    const existingTransactions = store.getState().txs;
    const duplicateMode = androMoneyDuplicateMode.value || "skip";
    const duplicateCount = findDuplicateExternalTransactions(existingTransactions, parsed.transactions).length;
    const newTransactions = parsed.transactions.filter(
      (transaction) => !existingTransactions.some((item) => sameExternalTransaction(item, transaction)),
    );
    const updateTransactions = duplicateMode === "update"
      ? parsed.transactions
          .map((transaction) => {
            const existingTransaction = findExternalTransaction(existingTransactions, transaction);
            return existingTransaction ? { ...transaction, id: existingTransaction.id } : null;
          })
          .filter(Boolean)
      : [];
    const repairTransactions = duplicateMode === "repair-accounts"
      ? parsed.transactions
          .map((transaction) => {
            const existingTransaction = findExternalTransaction(existingTransactions, transaction);
            const repaired = repairTransactionAccount(existingTransaction, transaction);
            return repaired ? { ...repaired, id: existingTransaction.id } : null;
          })
          .filter(Boolean)
      : [];
    const repairConflictCount = duplicateMode === "repair-accounts"
      ? parsed.transactions.filter((transaction) => {
          const existingTransaction = findExternalTransaction(existingTransactions, transaction);
          return existingTransaction && existingTransaction.type !== transaction.type;
        }).length
      : 0;
    const referencedAccountIds = new Set(
      [...newTransactions, ...updateTransactions, ...repairTransactions]
        .flatMap((transaction) => [transaction.acc, transaction.fromAcc, transaction.toAcc])
        .filter(Boolean)
        .map(String),
    );
    const newAccounts = plannedAccounts.filter((account) => referencedAccountIds.has(String(account.id)));

    if (!newTransactions.length && !updateTransactions.length && !repairTransactions.length) {
      const message = duplicateMode === "repair-accounts"
        ? `帳戶對應已是最新${repairConflictCount ? `；另有 ${repairConflictCount} 筆交易類型不同，未自動修改` : ""}`
        : "沒有新的 AndroMoney 交易可匯入";
      toast.show(message);
      reset();
      return;
    }

    commitState((draft) => {
      draft.accounts.push(...newAccounts);
      const updateIds = new Set(updateTransactions.map((transaction) => String(transaction.id)));
      let nextFunds = draft.sinkingFunds;
      updateIds.forEach((id) => {
        nextFunds = withoutFundEventsLinkedToTransaction(nextFunds, id);
      });
      draft.sinkingFunds = nextFunds;
      draft.txs = [
        ...newTransactions,
        ...draft.txs.map(
          (transaction) =>
            updateTransactions.find((item) => String(item.id) === String(transaction.id)) ||
            repairTransactions.find((item) => String(item.id) === String(transaction.id)) ||
            transaction,
        ),
      ];
    }, {
      updateUi: () => {
        reset();
        refreshTransactionUi();
      },
    });

    const skipped = duplicateMode === "skip" ? duplicateCount : 0;
    const cloudSaved = await waitForCloudSave();
    const result = `已新增 ${newTransactions.length} 筆、更新 ${updateTransactions.length} 筆${repairTransactions.length ? `，修正 ${repairTransactions.length} 筆帳戶` : ""}${newAccounts.length ? `，建立 ${newAccounts.length} 個帳戶` : ""}${skipped ? `，略過 ${skipped} 筆重複` : ""}${repairConflictCount ? `，${repairConflictCount} 筆類型不同未修改` : ""}`;
    toast.show(cloudSaved ? `${result}，已同步雲端` : `${result}，已保存於本機，尚未同步雲端`);
  };

  return {
    exportBackup,
    importBackupFile,
    exportAndroMoney,
    openAndroMoneyImport,
    confirmAndroMoneyImport,
    syncAndroMoneyAccountChoice,
    cancelAndroMoneyImport: reset,
    reset,
  };
}
