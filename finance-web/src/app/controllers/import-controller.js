import { withoutFundEventsLinkedToTransaction } from "../../domain/sinking-funds.js";

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

export function createImportController({
  elements,
  store,
  toast,
  replaceWholeState,
  persistWholeState,
  refreshWholeStateUi,
  commitState,
  refreshTransactionUi,
  readBackupFile,
  exportBackupFile,
  readTextFile,
  parseAndroMoneyCsv,
  buildAndroMoneyCsv,
  downloadTextFile,
  formatMoney,
  escapeHTML,
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
    androMoneyDuplicateMode.value = "skip";
  };

  const showAndroMoneyImportDialog = (parsed) => {
    const state = store.getState();
    const duplicates = findDuplicateExternalTransactions(state.txs, parsed.transactions);
    const duplicateKeys = new Set(duplicates.map(externalTransactionKey));
    const accountOptions = state.accounts
      .map((account) => `<option value="${escapeHTML(account.id)}">${escapeHTML(account.name)}</option>`)
      .join("");

    androMoneySummary.textContent =
      `讀到 ${parsed.transactions.length} 筆交易、${parsed.accountNames.length} 個帳戶名稱。` +
      (duplicates.length ? ` 其中 ${duplicates.length} 筆看起來已匯入過。` : "");
    androMoneyDuplicates.classList.toggle("d-none", duplicates.length === 0);
    androMoneyDuplicateMode.value = "skip";
    androMoneyAccounts.innerHTML = parsed.accountNames.length
      ? parsed.accountNames
          .map(
            (name) => `
              <label class="flex-col gap-1">
                <span class="flb">${escapeHTML(name)}</span>
                <select data-andromoney-account="${escapeHTML(name)}">${accountOptions}</select>
              </label>
            `,
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

  const readAndroMoneyAccountMap = () => Object.fromEntries(
    [...androMoneyAccounts.querySelectorAll("[data-andromoney-account]")].map((select) => [
      select.dataset.andromoneyAccount,
      select.value,
    ]),
  );

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

    const accountMap = readAndroMoneyAccountMap();
    const parsed = parseAndroMoneyCsv(pendingAndroMoneyText, { accountMap });
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

    if (!newTransactions.length && !updateTransactions.length) {
      toast.show("沒有新的 AndroMoney 交易可匯入");
      reset();
      return;
    }

    commitState((draft) => {
      const updateIds = new Set(updateTransactions.map((transaction) => String(transaction.id)));
      let nextFunds = draft.sinkingFunds;
      updateIds.forEach((id) => {
        nextFunds = withoutFundEventsLinkedToTransaction(nextFunds, id);
      });
      draft.sinkingFunds = nextFunds;
      draft.txs = [
        ...newTransactions,
        ...draft.txs.map(
          (transaction) => updateTransactions.find((item) => String(item.id) === String(transaction.id)) || transaction,
        ),
      ];
    }, {
      updateUi: () => {
        reset();
        refreshTransactionUi();
      },
    });

    const skipped = duplicateMode === "skip" ? duplicateCount : 0;
    toast.show(
      `已新增 ${newTransactions.length} 筆、更新 ${updateTransactions.length} 筆${skipped ? `，略過 ${skipped} 筆重複` : ""}`,
    );
  };

  return {
    exportBackup,
    importBackupFile,
    exportAndroMoney,
    openAndroMoneyImport,
    confirmAndroMoneyImport,
    cancelAndroMoneyImport: reset,
    reset,
  };
}
