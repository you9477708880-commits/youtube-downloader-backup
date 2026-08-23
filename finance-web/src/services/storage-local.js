import { STORAGE_KEYS } from "../config/constants.js";
import { getFinanceRuntime, runtimeStoragePrefix } from "../config/runtime.js";
import { cloneState } from "../state/initial-state.js";
import { normalizeFinanceStateMoney } from "../utils/normalize-state.js";

export const LOCAL_STORAGE_SCOPE = "local";
const PARSE_FAILED = Symbol("parse-failed");

function snapshotPrefix() {
  return `${runtimeStoragePrefix()}state:`;
}

function rollbackPrefix() {
  return `${runtimeStoragePrefix()}rollback:`;
}

function legacyMigrationKey() {
  return `${runtimeStoragePrefix()}migration:legacy-v6`;
}

function canReadLegacyStorage() {
  return !getFinanceRuntime().isAcceptance;
}

function safeParse(raw, fallback, label) {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Local storage value failed to parse: ${label}`, error);
    return fallback;
  }
}

function normalizeScope(scope) {
  const value = String(scope || LOCAL_STORAGE_SCOPE);
  if (value === LOCAL_STORAGE_SCOPE) return LOCAL_STORAGE_SCOPE;
  if (value.startsWith("uid:") && value.length > 4) return value;
  throw new Error("invalid-local-storage-scope");
}

function snapshotKey(scope) {
  return `${snapshotPrefix()}${encodeURIComponent(normalizeScope(scope))}`;
}

function loadLegacyState(baseState, storage) {
  const next = cloneState(baseState);

  next.txs = safeParse(storage.getItem(STORAGE_KEYS.txs), next.txs, STORAGE_KEYS.txs);
  next.bsI = safeParse(storage.getItem(STORAGE_KEYS.bsItems), next.bsI, STORAGE_KEYS.bsItems);
  next.wishes = safeParse(storage.getItem(STORAGE_KEYS.wishes), next.wishes, STORAGE_KEYS.wishes);
  next.sinkingFunds = safeParse(storage.getItem(STORAGE_KEYS.sinkingFunds), next.sinkingFunds, STORAGE_KEYS.sinkingFunds);
  next.accounts = safeParse(storage.getItem(STORAGE_KEYS.accounts), next.accounts, STORAGE_KEYS.accounts);
  next.userCats = safeParse(storage.getItem(STORAGE_KEYS.userCats), next.userCats, STORAGE_KEYS.userCats);
  next.settings = { ...next.settings, ...safeParse(storage.getItem(STORAGE_KEYS.settings), {}, STORAGE_KEYS.settings) };

  return normalizeFinanceStateMoney(next);
}

export function userStorageScope(uid) {
  const value = String(uid || "").trim();
  if (!value) throw new Error("missing-storage-user-id");
  return `uid:${value}`;
}

export function hasLocalState(scope = LOCAL_STORAGE_SCOPE, storage = globalThis.localStorage) {
  return Boolean(storage?.getItem(snapshotKey(scope)));
}

export function loadLocalState(baseState, scope = LOCAL_STORAGE_SCOPE, storage = globalThis.localStorage) {
  if (!storage) return cloneState(baseState);
  const normalizedScope = normalizeScope(scope);
  const raw = storage.getItem(snapshotKey(normalizedScope));
  if (!raw && normalizedScope === LOCAL_STORAGE_SCOPE && canReadLegacyStorage()) {
    const hasLegacy = Object.values(STORAGE_KEYS).some((key) => storage.getItem(key) !== null);
    if (hasLegacy) return loadLegacyState(baseState, storage);
  }
  const parsed = safeParse(raw, PARSE_FAILED, snapshotKey(scope));
  if (parsed === PARSE_FAILED) {
    if (normalizedScope === LOCAL_STORAGE_SCOPE && canReadLegacyStorage()) {
      const hasLegacy = Object.values(STORAGE_KEYS).some((key) => storage.getItem(key) !== null);
      if (hasLegacy) return loadLegacyState(baseState, storage);
    }
    return cloneState(baseState);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return cloneState(baseState);

  return normalizeFinanceStateMoney({
    ...cloneState(baseState),
    ...parsed,
    settings: { ...baseState.settings, ...(parsed.settings || {}) },
  });
}

export function saveLocalState(state, scope = LOCAL_STORAGE_SCOPE, storage = globalThis.localStorage) {
  if (!storage) return;
  const normalized = normalizeFinanceStateMoney(cloneState(state));
  storage.setItem(snapshotKey(scope), JSON.stringify(normalized));
}

export function migrateLegacyLocalState(baseState, storage = globalThis.localStorage) {
  if (!storage) return { migrated: false, reason: "storage-unavailable" };
  if (!canReadLegacyStorage()) return { migrated: false, reason: "acceptance-runtime-isolated" };
  const migrationKey = legacyMigrationKey();
  if (storage.getItem(migrationKey)) return { migrated: false, reason: "already-checked" };

  const hasLegacy = Object.values(STORAGE_KEYS).some((key) => storage.getItem(key) !== null);
  if (!hasLegacy) {
    storage.setItem(migrationKey, "no-legacy-data");
    return { migrated: false, reason: "no-legacy-data" };
  }

  if (hasLocalState(LOCAL_STORAGE_SCOPE, storage)) {
    storage.setItem(migrationKey, "local-snapshot-already-exists");
    return { migrated: false, reason: "local-snapshot-already-exists" };
  }

  const migratedState = loadLegacyState(baseState, storage);
  saveLocalState(migratedState, LOCAL_STORAGE_SCOPE, storage);
  storage.setItem(migrationKey, "migrated-to-local");
  return { migrated: true, state: migratedState };
}

export function clearLocalState(scope, storage = globalThis.localStorage) {
  storage?.removeItem(snapshotKey(scope));
}

export function saveRollbackSnapshot(state, scope, label, storage = globalThis.localStorage) {
  if (!storage) throw new Error("storage-unavailable");
  const normalizedScope = normalizeScope(scope);
  const normalized = normalizeFinanceStateMoney(cloneState(state));
  storage.setItem(`${rollbackPrefix()}${encodeURIComponent(normalizedScope)}`, JSON.stringify({
    label: String(label || "before-overwrite"),
    createdAt: new Date().toISOString(),
    state: normalized,
  }));
}

export const __localStorageTestUtils = {
  snapshotKey,
  get legacyMigrationKey() { return legacyMigrationKey(); },
  rollbackKey: (scope) => `${rollbackPrefix()}${encodeURIComponent(normalizeScope(scope))}`,
};
