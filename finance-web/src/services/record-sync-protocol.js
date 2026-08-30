import { isValidImportShape } from "./import-export.js";
import {
  recordEnvelopesToState,
  recordFingerprint,
  stateToRecordSpecs,
} from "./record-codec.js";

export function mapsEquivalent(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (!other || Number(other.revision) !== Number(value.revision) || recordFingerprint(other) !== recordFingerprint(value)) return false;
  }
  return true;
}

export function mergeRecordMapsByRevision(left, right) {
  const merged = new Map();
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    const leftRecord = left.get(key);
    const rightRecord = right.get(key);
    if (!leftRecord) {
      merged.set(key, rightRecord);
      continue;
    }
    if (!rightRecord) {
      merged.set(key, leftRecord);
      continue;
    }
    const leftRevision = Number(leftRecord.revision || 0);
    const rightRevision = Number(rightRecord.revision || 0);
    if (leftRevision > rightRevision) {
      merged.set(key, leftRecord);
      continue;
    }
    if (rightRevision > leftRevision) {
      merged.set(key, rightRecord);
      continue;
    }
    if (recordFingerprint(leftRecord) !== recordFingerprint(rightRecord)) {
      throw new Error(`equal-revision-record-mismatch:${key}`);
    }
    merged.set(key, rightRecord);
  }
  return merged;
}

export function serializeOutboxMutations(mutations) {
  return mutations.map(({ key, baseRevision, envelope }) => ({
    key,
    baseRevision,
    envelope: {
      ...envelope,
      updatedAt: null,
      deletedAt: envelope.deleted ? null : envelope.deletedAt,
    },
  }));
}

export function materializeValidatedRecords(records) {
  const state = recordEnvelopesToState(records);
  if (!isValidImportShape(state)) throw new Error("invalid-cloud-record-state");
  return state;
}

export function buildConflictResolutionState(context, choice) {
  const localSpecs = stateToRecordSpecs(context.localState);
  const merged = new Map(context.remoteRecords);
  const selectedKeys = choice === "local"
    ? context.mutationKeys
    : context.mutationKeys.filter((key) => !context.conflictKeys.includes(key));

  selectedKeys.forEach((key) => {
    const localRecord = localSpecs.get(key);
    const remoteRecord = merged.get(key);
    if (localRecord) {
      merged.set(key, {
        ...localRecord,
        revision: Number(remoteRecord?.revision || 0),
        deleted: false,
      });
      return;
    }
    if (remoteRecord) {
      merged.set(key, {
        ...remoteRecord,
        payload: null,
        deleted: true,
      });
    }
  });

  return {
    state: materializeValidatedRecords(merged),
    selectedKeys,
  };
}

export function sourceFingerprint(state) {
  const canonical = [...stateToRecordSpecs(state).entries()]
    .map(([key, record]) => `${key}:${recordFingerprint(record)}`)
    .sort()
    .join("|");
  let hash = 14695981039346656037n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = (hash * 1099511628211n) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}
