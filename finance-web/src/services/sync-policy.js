import { createInitialState } from "../state/initial-state.js";
import { normalizeFinanceStateMoney } from "../utils/normalize-state.js";

function normalizeForSyncCompare(state) {
  const base = createInitialState();
  const normalized = normalizeFinanceStateMoney({
    ...base,
    ...(state || {}),
    settings: { ...base.settings, ...((state || {}).settings || {}) },
  });

  return {
    schemaVersion: normalized.schemaVersion,
    txs: normalized.txs,
    bsI: normalized.bsI,
    wishes: normalized.wishes,
    sinkingFunds: normalized.sinkingFunds,
    accounts: normalized.accounts,
    userCats: normalized.userCats,
    settings: normalized.settings,
  };
}

function stableJson(value) {
  return JSON.stringify(value);
}

export function hasMeaningfulFinanceData(state) {
  return stableJson(normalizeForSyncCompare(state)) !== stableJson(normalizeForSyncCompare(createInitialState()));
}

export function areFinanceStatesEquivalent(left, right) {
  return stableJson(normalizeForSyncCompare(left)) === stableJson(normalizeForSyncCompare(right));
}

export function buildCloudConflictMessage(user) {
  const name = user?.displayName || user?.email || "目前的 Google 帳號";
  return [
    `偵測到這台裝置的本機資料，和 ${name} 的雲端資料都存在，而且內容不同。`,
    "",
    "請選擇這次要保留雲端資料、本機資料，或暫不處理。",
    "系統不會自動合併兩份財務資料，以免交易重複或漏算。",
  ].join("\n");
}
