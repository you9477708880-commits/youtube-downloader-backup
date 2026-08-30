const DEVICE_ID_KEY = "fin_v7:sync:device-id";
const OUTBOX_PREFIX = "fin_v7:sync:outbox:";

export function createSyncClientId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId(storage = globalThis.localStorage) {
  const existing = storage?.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = createSyncClientId("device");
  storage?.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function outboxKey(uid) {
  return `${OUTBOX_PREFIX}${encodeURIComponent(uid)}`;
}

export function cloudOutboxStorageKey(uid) {
  const value = String(uid || "").trim();
  if (!value) throw new Error("missing-cloud-outbox-user-id");
  return outboxKey(value);
}

export function readOutbox(uid, storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(outboxKey(uid)) || "null");
  } catch (error) {
    console.warn("Cloud outbox metadata failed to parse.", error);
    return null;
  }
}

export function writeOutbox(uid, value, storage = globalThis.localStorage) {
  if (!storage) return;
  if (!value) {
    storage.removeItem(outboxKey(uid));
    return;
  }
  storage.setItem(outboxKey(uid), JSON.stringify(value));
}
