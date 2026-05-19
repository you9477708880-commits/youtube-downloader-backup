import { STORAGE_KEYS } from "../config/constants.js";
import { cloneState } from "../state/initial-state.js";
import { normalizeFinanceStateMoney } from "../utils/normalize-state.js";

function safeParseStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Local storage field failed to parse: ${key}`, error);
    return fallback;
  }
}

export function loadLocalState(baseState) {
  const next = cloneState(baseState);

  next.txs = safeParseStorage(STORAGE_KEYS.txs, next.txs);
  next.bsI = safeParseStorage(STORAGE_KEYS.bsItems, next.bsI);
  next.wishes = safeParseStorage(STORAGE_KEYS.wishes, next.wishes);
  next.sinkingFunds = safeParseStorage(STORAGE_KEYS.sinkingFunds, next.sinkingFunds);
  next.accounts = safeParseStorage(STORAGE_KEYS.accounts, next.accounts);
  next.userCats = safeParseStorage(STORAGE_KEYS.userCats, next.userCats);
  next.settings = { ...next.settings, ...safeParseStorage(STORAGE_KEYS.settings, {}) };

  return normalizeFinanceStateMoney(next);
}

export function saveLocalState(state) {
  const normalized = normalizeFinanceStateMoney(state);
  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(normalized.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(normalized.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(normalized.wishes));
  localStorage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(normalized.sinkingFunds));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(normalized.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(normalized.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalized.settings));
}
