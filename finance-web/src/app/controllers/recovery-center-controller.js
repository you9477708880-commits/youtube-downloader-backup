import { describeRecoveryDifferences, restoreRecoveryRecords } from "../../services/conflict-recovery.js";

function filenameFor(entry) {
  const stamp = String(entry.createdAt || new Date().toISOString()).replace(/[:.]/g, "-");
  return `finance-recovery-${stamp}.json`;
}

function choiceLabel(choice) {
  if (choice === "cloud") return "當時保留雲端";
  if (choice === "local") return "當時保留本機";
  return "覆蓋前復原點";
}

function formatCreatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間未知";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function createRecoveryCenterController({
  elements,
  store,
  recoveryStore,
  getScope,
  commitState,
  refreshWholeStateUi,
  exportBackupFile,
  toast,
  escapeHTML,
  confirmRestore = (message) => window.confirm(message),
  confirmDelete = (message) => window.confirm(message),
  onWarn = (message, error) => console.warn(message, error),
} = {}) {
  if (!elements?.modal || !elements?.list || !elements?.empty || !elements?.summary) {
    throw new Error("recovery-center-elements-required");
  }
  if (!store || typeof store.getState !== "function") throw new Error("recovery-center-store-required");
  if (!recoveryStore || typeof recoveryStore.list !== "function") throw new Error("recovery-center-repository-required");
  if (typeof getScope !== "function" || typeof commitState !== "function") throw new Error("recovery-center-boundary-required");

  let entries = [];
  let requestVersion = 0;

  const close = () => {
    requestVersion += 1;
    elements.modal.classList.add("d-none");
  };

  const currentScope = () => getScope() || "local";

  const render = () => {
    const state = store.getState();
    elements.summary.textContent = entries.length
      ? `保留最近 ${entries.length} 次覆蓋前紀錄；系統最多保留 10 次或 30 天。`
      : "目前沒有衝突復原紀錄。一般衝突不會再自動下載 JSON。";
    elements.empty.classList.toggle("d-none", entries.length > 0);
    elements.list.innerHTML = entries.map((entry) => {
      const differences = describeRecoveryDifferences(entry, state);
      const safeId = escapeHTML(entry.id);
      const rows = differences.map((difference, index) => `
        <label class="recovery-record">
          <input type="checkbox" checked data-recovery-key="${escapeHTML(difference.key)}" data-recovery-entry="${safeId}">
          <span class="recovery-record-main">
            <span class="recovery-record-title">${escapeHTML(difference.kindLabel)}｜${escapeHTML(difference.title)}</span>
            <span class="recovery-record-diff">${escapeHTML(difference.summary)}</span>
          </span>
        </label>
      `).join("");
      return `
        <article class="recovery-card" data-recovery-card="${safeId}">
          <div class="recovery-card-head">
            <div>
              <div class="recovery-card-title">${escapeHTML(choiceLabel(entry.choice))}</div>
              <div class="recovery-card-meta">${escapeHTML(formatCreatedAt(entry.createdAt))}｜${differences.length} 筆差異</div>
            </div>
            <span class="bdg bdg-b">${entry.conflictType === "record" ? "同筆衝突" : "登入覆蓋"}</span>
          </div>
          <details class="recovery-details">
            <summary>查看並選擇要還原的紀錄</summary>
            <div class="recovery-record-list">${rows || '<div class="empty">沒有可還原的差異。</div>'}</div>
          </details>
          <div class="recovery-actions">
            <button type="button" class="sbtn" data-action="restore-recovery" data-id="${safeId}"${differences.length ? "" : " disabled"}>還原選取紀錄</button>
            <button type="button" class="sbtn outline" data-action="export-recovery" data-id="${safeId}">匯出 JSON</button>
            <button type="button" class="sbtn outline" data-action="delete-recovery" data-id="${safeId}">刪除</button>
          </div>
        </article>
      `;
    }).join("");
  };

  const open = async () => {
    const requestedScope = currentScope();
    const requestedVersion = ++requestVersion;
    try {
      const requestedEntries = await recoveryStore.list(requestedScope);
      if (requestedVersion !== requestVersion || requestedScope !== currentScope()) return false;
      entries = requestedEntries;
      render();
      elements.modal.classList.remove("d-none");
      elements.close?.focus();
      return true;
    } catch (error) {
      if (requestedVersion !== requestVersion) return false;
      onWarn("Recovery center could not be opened.", error);
      toast.show("無法讀取衝突復原紀錄，請稍後再試", "error");
      return false;
    }
  };

  const findEntry = async (id) => {
    const entry = await recoveryStore.get(String(id), currentScope());
    if (!entry) throw new Error("recovery-entry-not-found");
    return entry;
  };

  const selectedKeys = (entryId) => [...elements.list.querySelectorAll("[data-recovery-key]:checked")]
    .filter((node) => node.dataset.recoveryEntry === String(entryId))
    .map((node) => node.dataset.recoveryKey);

  const restore = async (id) => {
    try {
      const entry = await findEntry(id);
      const keys = selectedKeys(entry.id);
      if (!keys.length) {
        toast.show("請先勾選至少一筆要還原的紀錄", "error");
        return false;
      }
      if (!confirmRestore(`將以復原版本覆蓋目前選取的 ${keys.length} 筆紀錄，其他資料不會改變。確定繼續？`)) return false;
      const restored = restoreRecoveryRecords(store.getState(), entry, keys);
      commitState(() => restored, { updateUi: refreshWholeStateUi });
      toast.show(`已還原 ${keys.length} 筆紀錄，並排入雲端同步`);
      await open();
      return true;
    } catch (error) {
      onWarn("Recovery restore failed.", error);
      toast.show("復原失敗，目前資料沒有被修改", "error");
      return false;
    }
  };

  const exportEntry = async (id) => {
    try {
      const entry = await findEntry(id);
      exportBackupFile(entry.state, filenameFor(entry));
      toast.show("已匯出這一筆衝突復原資料");
      return true;
    } catch (error) {
      onWarn("Recovery export failed.", error);
      toast.show("復原資料匯出失敗", "error");
      return false;
    }
  };

  const remove = async (id) => {
    if (!confirmDelete("確定刪除這一筆衝突復原紀錄？刪除後無法復原。")) return false;
    try {
      const removed = await recoveryStore.remove(String(id), currentScope());
      if (!removed) throw new Error("recovery-entry-not-found");
      toast.show("已刪除衝突復原紀錄");
      await open();
      return true;
    } catch (error) {
      onWarn("Recovery delete failed.", error);
      toast.show("無法刪除衝突復原紀錄", "error");
      return false;
    }
  };

  return {
    open,
    close,
    restore,
    exportEntry,
    remove,
    reset: close,
  };
}
