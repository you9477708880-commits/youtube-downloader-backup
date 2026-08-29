import { localScopeStorageKeys } from "./storage-local.js";
import { cloudOutboxStorageKey } from "./storage-cloud-records.js";

function normalizeTarget({ scope, uid = "" }) {
  const normalizedScope = String(scope || "").trim();
  const normalizedUid = String(uid || "").trim();
  if (normalizedScope === "local" && !normalizedUid) return { scope: normalizedScope, uid: "" };
  if (normalizedUid && normalizedScope === `uid:${normalizedUid}`) {
    return { scope: normalizedScope, uid: normalizedUid };
  }
  throw new Error("invalid-device-clear-target");
}

function keyExists(storage, key) {
  return storage?.getItem(key) !== null;
}

function failure(code, completed, remaining, error, extra = {}) {
  return {
    ok: false,
    code,
    completed: [...completed],
    remaining: [...remaining],
    requiresReload: completed.includes("firestore-persistence"),
    error,
    ...extra,
  };
}

export function createDeviceDataClearService({
  storage = globalThis.localStorage,
  recoveryStore,
  cloudSync = null,
} = {}) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.removeItem !== "function") {
    throw new Error("device-clear-storage-required");
  }
  if (!recoveryStore || typeof recoveryStore.count !== "function" || typeof recoveryStore.clear !== "function") {
    throw new Error("device-clear-recovery-store-required");
  }

  const inspect = async (target) => {
    const normalized = normalizeTarget(target);
    const keys = localScopeStorageKeys(normalized.scope);
    const outbox = normalized.uid ? cloudOutboxStorageKey(normalized.uid) : "";
    const cloudStatus = normalized.uid
      ? cloudSync?.getDeviceClearStatus?.() || {}
      : {};
    const hasOutbox = Boolean(outbox && keyExists(storage, outbox));
    return {
      ...normalized,
      keys: { ...keys, outbox },
      hasSnapshot: keyExists(storage, keys.snapshot),
      hasRollback: keyExists(storage, keys.rollback),
      hasOutbox,
      recoveryCount: await recoveryStore.count(normalized.scope),
      cloudStatus: {
        uid: String(cloudStatus.uid || ""),
        signedIn: Boolean(cloudStatus.signedIn),
        queueActive: Boolean(cloudStatus.queueActive),
        hasPendingOutbox: Boolean(cloudStatus.hasPendingOutbox || hasOutbox),
        conflict: Boolean(cloudStatus.conflict),
      },
    };
  };

  const clear = async (target, { acknowledgeUnsynced = false } = {}) => {
    const plan = await inspect(target);
    const completed = [];
    const remaining = [
      ...(plan.uid ? ["firestore-persistence"] : []),
      "recovery",
      "rollback",
      ...(plan.uid ? ["outbox"] : []),
      "snapshot",
    ];
    const hasUnsynced = plan.cloudStatus.queueActive
      || plan.cloudStatus.hasPendingOutbox
      || plan.cloudStatus.conflict;

    if (hasUnsynced && !acknowledgeUnsynced) {
      return failure(
        "unsynced-acknowledgement-required",
        completed,
        remaining,
        null,
        { plan },
      );
    }

    if (plan.uid) {
      if (!cloudSync || typeof cloudSync.clearDevicePersistence !== "function") {
        return failure("cloud-clear-boundary-unavailable", completed, remaining, null, { plan });
      }
      try {
        await cloudSync.clearDevicePersistence({
          expectedUid: plan.uid,
          allowDiscardUnsynced: acknowledgeUnsynced,
        });
        completed.push("firestore-persistence");
        remaining.splice(remaining.indexOf("firestore-persistence"), 1);
      } catch (error) {
        return failure("firestore-persistence-clear-failed", completed, remaining, error, {
          plan,
          requiresReload: true,
        });
      }
    }

    try {
      await recoveryStore.clear(plan.scope);
      completed.push("recovery");
      remaining.splice(remaining.indexOf("recovery"), 1);
    } catch (error) {
      return failure("recovery-clear-failed", completed, remaining, error, { plan });
    }

    const remove = (label, key) => {
      if (key) storage.removeItem(key);
      completed.push(label);
      const index = remaining.indexOf(label);
      if (index >= 0) remaining.splice(index, 1);
    };

    try {
      remove("rollback", plan.keys.rollback);
      if (plan.uid) remove("outbox", plan.keys.outbox);
      remove("snapshot", plan.keys.snapshot);
    } catch (error) {
      return failure("local-storage-clear-failed", completed, remaining, error, { plan });
    }

    return {
      ok: true,
      code: "cleared",
      completed,
      remaining,
      requiresReload: Boolean(plan.uid),
      plan,
    };
  };

  return { inspect, clear };
}

export const __deviceDataClearTestUtils = { normalizeTarget };
