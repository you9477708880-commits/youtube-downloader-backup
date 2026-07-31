import { CURRENT_SCHEMA_VERSION } from "../config/constants.js";
import { createInitialState } from "../state/initial-state.js";
import { normalizeFinanceStateMoney } from "../utils/normalize-state.js";

export const SYNC_SCHEMA_VERSION = 1;

const ARRAY_KINDS = [
  ["transaction", "txs"],
  ["balanceSheetItem", "bsI"],
  ["wish", "wishes"],
  ["account", "accounts"],
];

function canonicalId(value) {
  if (typeof value === "string" && value.length) return value;
  if (Number.isSafeInteger(value)) return String(value);
  throw new Error("invalid-record-id");
}

function base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function recordKey(kind, recordId) {
  return base64Url(JSON.stringify([kind, canonicalId(recordId)]));
}

function addRecord(map, { kind, recordId, payload, position = 0 }) {
  const id = canonicalId(recordId);
  const key = recordKey(kind, id);
  if (map.has(key)) throw new Error(`duplicate-record-id:${kind}:${id}`);
  map.set(key, {
    kind,
    recordId: id,
    payload: structuredClone(payload),
    position,
  });
}

export function stateToRecordSpecs(state) {
  const normalized = normalizeFinanceStateMoney(structuredClone(state));
  const records = new Map();

  for (const [kind, field] of ARRAY_KINDS) {
    normalized[field].forEach((payload, position) => {
      addRecord(records, { kind, recordId: payload.id, payload, position });
    });
  }

  normalized.sinkingFunds.forEach((fund, position) => {
    const { events = [], ...fundPayload } = fund;
    addRecord(records, {
      kind: "sinkingFund",
      recordId: fund.id,
      payload: fundPayload,
      position,
    });
    events.forEach((event, eventPosition) => {
      addRecord(records, {
        kind: "fundEvent",
        recordId: `${canonicalId(fund.id)}:${canonicalId(event.id)}`,
        payload: { ...event, fundId: canonicalId(fund.id) },
        position: eventPosition,
      });
    });
  });

  addRecord(records, {
    kind: "settings",
    recordId: "root",
    payload: normalized.settings,
  });
  addRecord(records, {
    kind: "userCategories",
    recordId: "root",
    payload: normalized.userCats,
  });

  return records;
}

function activeRecords(records, kind) {
  return [...records.entries()]
    .filter(([, record]) => record.kind === kind && !record.deleted)
    .sort((left, right) => {
      const positionDiff = Number(left[1].position || 0) - Number(right[1].position || 0);
      return positionDiff || left[0].localeCompare(right[0]);
    });
}

export function recordEnvelopesToState(records) {
  const base = createInitialState();
  const next = {
    ...base,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    txs: [],
    bsI: [],
    wishes: [],
    sinkingFunds: [],
    accounts: [],
    userCats: { income: [], expense: [] },
    settings: { ...base.settings },
  };

  for (const [kind, field] of ARRAY_KINDS) {
    next[field] = activeRecords(records, kind).map(([, record]) => structuredClone(record.payload));
  }

  const funds = activeRecords(records, "sinkingFund").map(([, record]) => ({
    ...structuredClone(record.payload),
    events: [],
  }));
  const fundsById = new Map(funds.map((fund) => [canonicalId(fund.id), fund]));
  for (const [, record] of activeRecords(records, "fundEvent")) {
    const { fundId, ...event } = structuredClone(record.payload);
    const fund = fundsById.get(canonicalId(fundId));
    if (fund) fund.events.push(event);
  }
  next.sinkingFunds = funds;

  const settings = activeRecords(records, "settings")[0]?.[1]?.payload;
  const userCats = activeRecords(records, "userCategories")[0]?.[1]?.payload;
  if (settings) next.settings = { ...next.settings, ...structuredClone(settings) };
  if (userCats) next.userCats = structuredClone(userCats);

  return normalizeFinanceStateMoney(next);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

export function recordFingerprint(record) {
  return JSON.stringify(stableValue({
    kind: record.kind,
    recordId: record.recordId,
    deleted: Boolean(record.deleted),
    payload: record.deleted ? null : record.payload,
    position: Number(record.position || 0),
  }));
}

export function buildRecordMutations(state, baseline, { updatedBy, updatedAt, migrationId = "" }) {
  const desired = stateToRecordSpecs(state);
  const mutations = [];
  const keys = new Set([...baseline.keys(), ...desired.keys()]);

  for (const key of keys) {
    const previous = baseline.get(key);
    const target = desired.get(key);
    const previousComparable = previous && {
      ...previous,
      deleted: Boolean(previous.deleted),
    };

    if (target && previousComparable && recordFingerprint(target) === recordFingerprint(previousComparable)) {
      continue;
    }
    if (!target && (!previous || previous.deleted)) continue;

    const envelope = target
      ? {
          ...target,
          revision: Number(previous?.revision || 0) + 1,
          updatedBy,
          updatedAt,
          deleted: false,
          deletedAt: null,
          migrationId: previous?.migrationId || migrationId,
          syncSchemaVersion: SYNC_SCHEMA_VERSION,
        }
      : {
          kind: previous.kind,
          recordId: previous.recordId,
          payload: null,
          position: Number(previous.position || 0),
          revision: Number(previous.revision || 0) + 1,
          updatedBy,
          updatedAt,
          deleted: true,
          deletedAt: updatedAt,
          migrationId: previous?.migrationId || migrationId,
          syncSchemaVersion: SYNC_SCHEMA_VERSION,
        };

    mutations.push({ key, baseRevision: Number(previous?.revision || 0), envelope });
  }

  return mutations;
}

export function applyMutations(records, mutations) {
  const next = new Map(records);
  mutations.forEach(({ key, envelope }) => next.set(key, {
    ...envelope,
    payload: envelope.payload ? structuredClone(envelope.payload) : null,
  }));
  return next;
}

export function mapSnapshotRecords(snapshot) {
  const records = new Map();
  const identities = new Set();
  snapshot.forEach((document) => {
    const value = document.data();
    if (!value || typeof value !== "object") return;
    if (!value.kind || !value.recordId || !Number.isSafeInteger(value.revision)) return;
    const expectedKey = recordKey(value.kind, value.recordId);
    if (document.id !== expectedKey) throw new Error("invalid-cloud-record-key");
    const identity = `${value.kind}\u0000${value.recordId}`;
    if (identities.has(identity)) throw new Error("duplicate-cloud-record-identity");
    identities.add(identity);
    records.set(document.id, {
      ...value,
      payload: value.payload ? structuredClone(value.payload) : null,
    });
  });
  return records;
}
