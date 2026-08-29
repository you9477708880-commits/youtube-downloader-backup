import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const PROJECT_ID = "demo-finance-web";
const APP_ID = "financial-computer";
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
let testEnv;

const legacyPath = (uid) => `artifacts/${APP_ID}/users/${uid}/data/finance_v6`;
const metaPath = (uid) => `artifacts/${APP_ID}/users/${uid}/sync/finance_v7`;
const recordPath = (uid, key = "transaction__tx-1") =>
  `artifacts/${APP_ID}/users/${uid}/sync/finance_v7/records/${key}`;

function preparingMeta(overrides = {}) {
  return {
    status: "preparing",
    migrationId: "migration-1",
    migrationSourceHash: "source-hash-1",
    ownerDeviceId: "device-1",
    syncSchemaVersion: 1,
    stateSchemaVersion: 7,
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function activeMeta(overrides = {}) {
  return {
    ...preparingMeta(),
    status: "active",
    recordCount: 1,
    ...overrides,
  };
}

function recordEnvelope(overrides = {}) {
  return {
    kind: "transaction",
    recordId: "tx-1",
    payload: { id: "tx-1", amount: 100 },
    position: 0,
    revision: 1,
    updatedBy: "device-1",
    updatedAt: serverTimestamp(),
    deleted: false,
    deletedAt: null,
    migrationId: "",
    syncSchemaVersion: 1,
    ...overrides,
  };
}

async function seed(path, value) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), value);
  });
}

describe("Firestore security rules emulator", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  test("unauthenticated and cross-UID access is denied", async () => {
    await seed(legacyPath("bob"), { txs: [] });
    await seed(metaPath("bob"), { ...activeMeta(), updatedAt: new Date() });
    await seed(recordPath("bob"), {
      ...recordEnvelope(),
      updatedAt: new Date(),
    });

    const guest = testEnv.unauthenticatedContext().firestore();
    const alice = testEnv.authenticatedContext("alice").firestore();

    await assertFails(getDoc(doc(guest, legacyPath("bob"))));
    await assertFails(setDoc(doc(guest, legacyPath("bob")), { txs: [] }));
    await assertFails(getDoc(doc(alice, legacyPath("bob"))));
    await assertFails(getDoc(doc(alice, metaPath("bob"))));
    await assertFails(getDoc(doc(alice, recordPath("bob"))));
    await assertFails(getDocs(collection(alice, `${metaPath("bob")}/records`)));
    await assertFails(setDoc(doc(alice, legacyPath("bob")), { txs: [] }));
    await assertFails(setDoc(doc(alice, metaPath("bob")), preparingMeta()));
    await assertFails(setDoc(doc(alice, recordPath("bob", "transaction__new")), recordEnvelope()));
    await assertFails(deleteDoc(doc(alice, recordPath("bob"))));
    await assertFails(setDoc(
      doc(alice, `artifacts/${APP_ID}/users/alice/sync/not_finance_v7`),
      preparingMeta(),
    ));
    await assertFails(setDoc(doc(alice, "unexpected/path"), { value: true }));
  });

  test("the owner can use legacy data only before the v7 fence exists", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const legacy = doc(alice, legacyPath("alice"));
    const meta = doc(alice, metaPath("alice"));

    await assertSucceeds(setDoc(legacy, { txs: [] }));
    await assertSucceeds(getDoc(legacy));
    await assertSucceeds(setDoc(meta, preparingMeta()));
    await assertFails(setDoc(legacy, { txs: [{ id: "late-write" }] }));
    await assertFails(deleteDoc(legacy));
  });

  test("migration records require the preparing migration ID and cannot update early", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const meta = doc(alice, metaPath("alice"));
    const validRecord = doc(alice, recordPath("alice"));
    const wrongRecord = doc(alice, recordPath("alice", "transaction__wrong"));

    await assertFails(setDoc(meta, activeMeta()));
    await assertSucceeds(setDoc(meta, preparingMeta()));
    await assertSucceeds(setDoc(validRecord, recordEnvelope({ migrationId: "migration-1" })));
    await assertFails(setDoc(
      wrongRecord,
      recordEnvelope({ recordId: "wrong", migrationId: "another-migration" }),
    ));
    await assertFails(setDoc(
      validRecord,
      recordEnvelope({ revision: 2, migrationId: "migration-1", payload: { id: "tx-1", amount: 200 } }),
    ));
  });

  test("only an identity-preserving preparing-to-active transition is allowed", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const meta = doc(alice, metaPath("alice"));

    await assertSucceeds(setDoc(meta, preparingMeta()));
    await assertFails(setDoc(meta, activeMeta({ migrationId: "changed" })));
    await assertFails(setDoc(meta, activeMeta({ ownerDeviceId: "changed" })));
    await assertFails(setDoc(meta, activeMeta({ migrationSourceHash: "changed" })));
    await assertFails(setDoc(meta, activeMeta({ recordCount: -1 })));
    await assertSucceeds(setDoc(meta, activeMeta()));
    await assertFails(setDoc(meta, activeMeta({ recordCount: 2 })));
    await assertFails(deleteDoc(meta));
  });

  test("active records enforce revision increments and stable identity", async () => {
    await seed(metaPath("alice"), { ...activeMeta(), updatedAt: new Date() });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const record = doc(alice, recordPath("alice"));

    await assertFails(setDoc(doc(alice, legacyPath("alice")), { txs: [] }));
    await assertFails(setDoc(record, recordEnvelope({ revision: 2 })));
    await assertFails(setDoc(record, recordEnvelope({ migrationId: "not-empty" })));
    await assertSucceeds(setDoc(record, recordEnvelope()));
    await assertSucceeds(setDoc(record, recordEnvelope({
      revision: 2,
      payload: { id: "tx-1", amount: 200 },
    })));
    await assertFails(setDoc(record, recordEnvelope({
      revision: 4,
      payload: { id: "tx-1", amount: 400 },
    })));
    await assertFails(setDoc(record, recordEnvelope({
      revision: 3,
      kind: "wish",
      payload: { id: "tx-1", name: "changed-kind" },
    })));
    await assertFails(setDoc(record, recordEnvelope({
      revision: 3,
      recordId: "changed-id",
      payload: { id: "changed-id", amount: 300 },
    })));
    await assertFails(setDoc(record, recordEnvelope({
      revision: 3,
      migrationId: "changed",
    })));
  });

  test("record envelopes reject unknown kinds, invalid positions, extra fields, and client timestamps", async () => {
    await seed(metaPath("alice"), { ...activeMeta(), updatedAt: new Date() });
    const alice = testEnv.authenticatedContext("alice").firestore();

    await assertSucceeds(setDoc(
      doc(alice, recordPath("alice", "lifeRoutine__routine-1")),
      recordEnvelope({
        kind: "lifeRoutine",
        recordId: "routine-1",
        payload: { id: "routine-1", name: "半年洗牙", query: "洗牙", expectedIntervalDays: 180, dueSoonDays: 14, enabled: true },
      }),
    ));

    await assertFails(setDoc(
      doc(alice, recordPath("alice", "unknown__1")),
      recordEnvelope({ kind: "unknown", recordId: "unknown-1" }),
    ));
    await assertFails(setDoc(
      doc(alice, recordPath("alice", "transaction__negative")),
      recordEnvelope({ recordId: "negative", position: -1 }),
    ));
    await assertFails(setDoc(
      doc(alice, recordPath("alice", "transaction__extra")),
      { ...recordEnvelope({ recordId: "extra" }), unexpected: true },
    ));
    await assertFails(setDoc(
      doc(alice, recordPath("alice", "transaction__timestamp")),
      recordEnvelope({ recordId: "timestamp", updatedAt: new Date() }),
    ));
  });

  test("tombstones require null payload, server deletion time, and the next revision", async () => {
    await seed(metaPath("alice"), { ...activeMeta(), updatedAt: new Date() });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const record = doc(alice, recordPath("alice"));

    await assertSucceeds(setDoc(record, recordEnvelope()));
    await assertFails(setDoc(record, recordEnvelope({
      revision: 2,
      deleted: true,
      deletedAt: serverTimestamp(),
    })));
    await assertFails(setDoc(record, recordEnvelope({
      revision: 2,
      payload: null,
      deleted: true,
      deletedAt: null,
    })));
    await assertSucceeds(setDoc(record, recordEnvelope({
      revision: 2,
      payload: null,
      deleted: true,
      deletedAt: serverTimestamp(),
    })));
    await assertFails(deleteDoc(record));
  });

  test("current rules intentionally allow revision-one tombstones and later resurrection", async () => {
    await seed(metaPath("alice"), { ...activeMeta(), updatedAt: new Date() });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const record = doc(alice, recordPath("alice", "transaction__deleted"));

    await assertSucceeds(setDoc(record, recordEnvelope({
      recordId: "deleted",
      payload: null,
      deleted: true,
      deletedAt: serverTimestamp(),
    })));
    await assertSucceeds(setDoc(record, recordEnvelope({
      recordId: "deleted",
      revision: 2,
      payload: { id: "deleted", amount: 50 },
      deleted: false,
      deletedAt: null,
    })));
  });
});
