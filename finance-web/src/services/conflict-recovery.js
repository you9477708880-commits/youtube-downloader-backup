import {
  recordKey,
  recordEnvelopesToState,
  recordFingerprint,
  stateToRecordSpecs,
} from "./record-codec.js";

export const RECOVERY_RETENTION_COUNT = 10;
export const RECOVERY_RETENTION_DAYS = 30;

const DATABASE_NAME = "finance-web-recovery-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "entries";

function clone(value) {
  return structuredClone(value);
}

function normalizeScope(scope) {
  const value = String(scope || "").trim();
  if (value === "local" || (value.startsWith("uid:") && value.length > 4)) return value;
  throw new Error("invalid-recovery-scope");
}

function createRecoveryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `recovery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb-request-failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("indexeddb-transaction-aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("indexeddb-transaction-failed"));
  });
}

export function createIndexedDbRecoveryDriver(indexedDb = globalThis.indexedDB) {
  if (!indexedDb?.open) {
    const unavailable = async () => { throw new Error("indexeddb-unavailable"); };
    return { put: unavailable, get: unavailable, getAll: unavailable, delete: unavailable };
  }

  let databasePromise = null;
  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("scope", "scope", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error("indexeddb-open-failed"));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new Error("indexeddb-open-blocked"));
      };
    });
    return databasePromise;
  };

  const transact = async (mode, operation) => {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    const result = await operation(store);
    await done;
    return result;
  };

  return {
    put: (entry) => transact("readwrite", async (store) => {
      await requestResult(store.put(clone(entry)));
    }),
    get: (id) => transact("readonly", async (store) => clone(await requestResult(store.get(id)) || null)),
    getAll: () => transact("readonly", async (store) => clone(await requestResult(store.getAll()))),
    delete: (id) => transact("readwrite", async (store) => {
      await requestResult(store.delete(id));
    }),
  };
}

function differingRecordKeys(losingState, winnerState) {
  const losing = stateToRecordSpecs(losingState);
  const winner = stateToRecordSpecs(winnerState);
  const keys = new Set([...losing.keys(), ...winner.keys()]);
  return [...keys].filter((key) => {
    const left = losing.get(key);
    const right = winner.get(key);
    if (!left || !right) return true;
    return recordFingerprint(left) !== recordFingerprint(right);
  });
}

function normalizeEntry(input, { now, createId }) {
  const createdAt = input.createdAt || now().toISOString();
  const detectedKeys = input.winnerState
    ? differingRecordKeys(input.state, input.winnerState)
    : [];
  const requestedKeys = [...new Set((input.recordKeys || []).map(String))];
  const recordKeys = requestedKeys.length
    ? requestedKeys.filter((key) => detectedKeys.includes(key) || !input.winnerState)
    : detectedKeys;

  return {
    id: String(input.id || createId()),
    scope: normalizeScope(input.scope),
    label: String(input.label || "before-overwrite"),
    createdAt,
    choice: ["cloud", "local"].includes(input.choice) ? input.choice : "",
    conflictType: input.conflictType === "record" ? "record" : "initial",
    recordKeys,
    state: clone(input.state),
  };
}

export function createConflictRecoveryStore({
  driver = createIndexedDbRecoveryDriver(),
  now = () => new Date(),
  createId = createRecoveryId,
  retentionCount = RECOVERY_RETENTION_COUNT,
  retentionDays = RECOVERY_RETENTION_DAYS,
} = {}) {
  if (!driver || ["put", "get", "getAll", "delete"].some((name) => typeof driver[name] !== "function")) {
    throw new Error("recovery-driver-required");
  }

  const listRaw = async (scope) => {
    const normalizedScope = normalizeScope(scope);
    return (await driver.getAll())
      .filter((entry) => entry?.scope === normalizedScope)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  };

  const cleanup = async (scope) => {
    const entries = await listRaw(scope);
    const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
    const removeIds = entries
      .filter((entry, index) => index >= retentionCount || Date.parse(entry.createdAt) < cutoff)
      .map((entry) => entry.id);
    await Promise.all(removeIds.map((id) => driver.delete(id)));
    return removeIds.length;
  };

  const cleanupExpiredAcrossScopes = async () => {
    const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
    const removeIds = (await driver.getAll())
      .filter((entry) => Date.parse(entry?.createdAt) < cutoff)
      .map((entry) => entry.id);
    await Promise.all(removeIds.map((id) => driver.delete(id)));
    return removeIds.length;
  };

  return {
    async save(input) {
      const entry = normalizeEntry(input, { now, createId });
      await driver.put(entry);
      await cleanupExpiredAcrossScopes();
      await cleanup(entry.scope);
      return clone(entry);
    },
    async list(scope) {
      await cleanupExpiredAcrossScopes();
      await cleanup(scope);
      return clone(await listRaw(scope));
    },
    async get(id, scope) {
      const entry = await driver.get(String(id));
      if (!entry || entry.scope !== normalizeScope(scope)) return null;
      return clone(entry);
    },
    async remove(id, scope) {
      const entry = await driver.get(String(id));
      if (!entry || entry.scope !== normalizeScope(scope)) return false;
      await driver.delete(entry.id);
      return true;
    },
    cleanup,
  };
}

const KIND_LABELS = {
  transaction: "交易",
  balanceSheetItem: "資產負債項目",
  wish: "待購項目",
  account: "帳戶",
  sinkingFund: "大額準備",
  fundEvent: "準備事件",
  settings: "設定",
  userCategories: "自訂分類",
};

const FIELD_LABELS = {
  amount: "金額",
  desc: "備註",
  date: "日期",
  type: "交易類型",
  acc: "帳戶",
  fromAcc: "轉出帳戶",
  toAcc: "轉入帳戶",
  cat: "分類",
  category: "主分類",
  subcategory: "子分類",
  linkedFundId: "大額準備連結",
  name: "名稱",
  initialBalance: "起始餘額",
  monthlyContribution: "每月提撥",
  targetAmount: "目標金額",
  startMonth: "開始月份",
  targetMonth: "目標月份",
  settings: "設定",
};

function displayTitle(record) {
  if (!record) return "已刪除的紀錄";
  const payload = record.payload || {};
  return String(payload.desc || payload.name || payload.note || record.recordId || "未命名紀錄");
}

function changedFieldNames(left, right) {
  if (!left || !right) return [];
  const leftPayload = left.payload || {};
  const rightPayload = right.payload || {};
  return [...new Set([...Object.keys(leftPayload), ...Object.keys(rightPayload)])]
    .filter((key) => JSON.stringify(leftPayload[key]) !== JSON.stringify(rightPayload[key]))
    .filter((key) => key !== "id");
}

export function describeRecoveryDifferences(entry, currentState) {
  const recovered = stateToRecordSpecs(entry.state);
  const current = stateToRecordSpecs(currentState);
  const keys = entry.recordKeys?.length
    ? entry.recordKeys
    : differingRecordKeys(entry.state, currentState);

  return keys.map((key) => {
    const recoveredRecord = recovered.get(key);
    const currentRecord = current.get(key);
    const record = recoveredRecord || currentRecord;
    const fields = changedFieldNames(recoveredRecord, currentRecord);
    let status = "內容不同";
    if (recoveredRecord && !currentRecord) status = "復原後會重新加入";
    if (!recoveredRecord && currentRecord) status = "復原後會刪除";
    return {
      key,
      kind: record?.kind || "unknown",
      kindLabel: KIND_LABELS[record?.kind] || "紀錄",
      recordId: record?.recordId || "",
      title: displayTitle(record),
      fields,
      summary: fields.length ? `不同欄位：${fields.map((field) => FIELD_LABELS[field] || field).join("、")}` : status,
    };
  });
}

export function createRecoveryPreserver({
  recoveryStore,
  getScope,
  exportEmergency,
  onSaved = () => {},
  onEmergency = () => {},
  onFailure = () => {},
  onWarn = () => {},
} = {}) {
  if (!recoveryStore || typeof recoveryStore.save !== "function") throw new Error("recovery-store-required");
  if (typeof getScope !== "function" || typeof exportEmergency !== "function") throw new Error("recovery-preserver-boundary-required");

  return async (state, label, metadata = {}) => {
    const scope = getScope();
    if (!scope) return false;
    try {
      await recoveryStore.save({
        scope,
        label,
        state,
        winnerState: metadata.winnerState,
        recordKeys: metadata.recordKeys,
        choice: metadata.choice,
        conflictType: metadata.conflictType,
      });
      onSaved();
      return true;
    } catch (error) {
      onWarn("Internal recovery snapshot could not be saved.", error);
      try {
        exportEmergency(state, label);
        onEmergency();
        return true;
      } catch (downloadError) {
        onWarn("Emergency recovery download failed.", downloadError);
        onFailure();
        return false;
      }
    }
  };
}

export function restoreRecoveryRecords(currentState, entry, selectedKeys) {
  const current = stateToRecordSpecs(currentState);
  const recovered = stateToRecordSpecs(entry.state);
  const allowed = new Set(entry.recordKeys?.length ? entry.recordKeys : [...recovered.keys()]);
  const selected = new Set([...new Set((selectedKeys || []).map(String))].filter((key) => allowed.has(key)));
  if (!selected.size) throw new Error("no-recovery-records-selected");

  // A fund event cannot exist without its parent fund. Restoring a deleted
  // fund must also remove its child events, otherwise the record map would
  // retain invisible orphan records that could reappear in a later sync.
  [...selected].forEach((key) => {
    const recoveredRecord = recovered.get(key);
    const currentRecord = current.get(key);
    const record = recoveredRecord || currentRecord;
    if (record?.kind === "fundEvent" && recoveredRecord) {
      const fundId = String(recoveredRecord.payload?.fundId || "");
      const parentKey = fundId ? recordKey("sinkingFund", fundId) : "";
      if (parentKey && !current.has(parentKey) && recovered.has(parentKey)) selected.add(parentKey);
    }
    if (record?.kind === "sinkingFund" && !recoveredRecord && currentRecord) {
      const fundId = String(currentRecord.recordId);
      current.forEach((candidate, candidateKey) => {
        if (candidate.kind === "fundEvent" && String(candidate.payload?.fundId) === fundId) {
          selected.add(candidateKey);
        }
      });
    }
  });

  selected.forEach((key) => {
    if (recovered.has(key)) current.set(key, clone(recovered.get(key)));
    else current.delete(key);
  });
  const next = recordEnvelopesToState(current);
  next.txType = currentState.txType || next.txType;
  return next;
}

export const __conflictRecoveryTestUtils = {
  differingRecordKeys,
  normalizeScope,
};
