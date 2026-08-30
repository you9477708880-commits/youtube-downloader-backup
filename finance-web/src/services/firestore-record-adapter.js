import { CURRENT_SCHEMA_VERSION } from "../config/constants.js";
import { createInitialState } from "../state/initial-state.js";
import { isValidImportShape } from "./import-export.js";
import { areFinanceStatesEquivalent } from "./sync-policy.js";
import {
  SYNC_SCHEMA_VERSION,
  buildRecordMutations,
  mapSnapshotRecords,
  recordFingerprint,
  stateToRecordSpecs,
} from "./record-codec.js";
import { createSyncClientId } from "./record-sync-local-store.js";
import {
  materializeValidatedRecords,
  sourceFingerprint,
} from "./record-sync-protocol.js";

export const RECORD_BATCH_LIMIT = 400;

export function createFirestoreRecordAdapter({ firestoreMod, db, appId, deviceId }) {
  const refsFor = (uid) => {
    const legacy = firestoreMod.doc(db, "artifacts", appId, "users", uid, "data", "finance_v6");
    const meta = firestoreMod.doc(db, "artifacts", appId, "users", uid, "sync", "finance_v7");
    const records = firestoreMod.collection(db, "artifacts", appId, "users", uid, "sync", "finance_v7", "records");
    return { legacy, meta, records };
  };

  const writeRecordBatches = async (recordsRef, mutations) => {
    for (let offset = 0; offset < mutations.length; offset += RECORD_BATCH_LIMIT) {
      const batch = firestoreMod.writeBatch(db);
      for (const mutation of mutations.slice(offset, offset + RECORD_BATCH_LIMIT)) {
        batch.set(firestoreMod.doc(recordsRef, mutation.key), mutation.envelope);
      }
      await batch.commit();
    }
  };

  const readRecords = async (refs) => mapSnapshotRecords(await firestoreMod.getDocs(refs.records));

  const activateMigration = async ({
    uid,
    generation,
    state,
    refs,
    isCurrent,
    initialLegacyFingerprint,
  }) => {
    if (!isValidImportShape(state)) throw new Error("invalid-migration-state");
    const migrationId = createSyncClientId("migration");
    let migrationState = state;
    let sourceHash = sourceFingerprint(migrationState);
    const claimedMigrationId = await firestoreMod.runTransaction(db, async (transaction) => {
      const current = await transaction.get(refs.meta);
      const data = current.exists() ? current.data() : null;
      if (data?.status === "active") return "";
      if (data?.status === "preparing" && data.ownerDeviceId !== deviceId) {
        throw new Error("migration-in-progress");
      }
      if (data?.status === "preparing" && data.migrationSourceHash !== sourceHash) {
        throw new Error("migration-source-changed");
      }
      const claimedId = data?.migrationId || migrationId;
      transaction.set(refs.meta, {
        status: "preparing",
        migrationId: claimedId,
        migrationSourceHash: data?.migrationSourceHash || sourceHash,
        ownerDeviceId: deviceId,
        syncSchemaVersion: SYNC_SCHEMA_VERSION,
        stateSchemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: firestoreMod.serverTimestamp(),
      });
      return claimedId;
    });
    if (!claimedMigrationId) return;
    if (!isCurrent(uid, generation)) return;

    const fencedLegacySnapshot = await firestoreMod.getDoc(refs.legacy);
    if (initialLegacyFingerprint) {
      const latestLegacyState = fencedLegacySnapshot.exists()
        ? fencedLegacySnapshot.data()
        : createInitialState();
      if (!isValidImportShape(latestLegacyState)) throw new Error("invalid-fenced-legacy-state");
      const latestLegacyHash = sourceFingerprint(latestLegacyState);
      if (latestLegacyHash !== initialLegacyFingerprint) {
        if (sourceHash !== initialLegacyFingerprint) {
          throw new Error("legacy-changed-before-cutover");
        }
        migrationState = latestLegacyState;
        sourceHash = latestLegacyHash;
        await firestoreMod.setDoc(refs.meta, {
          status: "preparing",
          migrationId: claimedMigrationId,
          migrationSourceHash: sourceHash,
          ownerDeviceId: deviceId,
          syncSchemaVersion: SYNC_SCHEMA_VERSION,
          stateSchemaVersion: CURRENT_SCHEMA_VERSION,
          updatedAt: firestoreMod.serverTimestamp(),
        });
      }
    }

    const existing = await readRecords(refs);
    const initialMutations = buildRecordMutations(migrationState, new Map(), {
      updatedBy: deviceId,
      updatedAt: firestoreMod.serverTimestamp(),
      migrationId: claimedMigrationId,
    }).filter((mutation) => {
      const present = existing.get(mutation.key);
      if (!present) return true;
      if (present.revision === 1 && recordFingerprint(present) === recordFingerprint(mutation.envelope)) return false;
      throw new Error(`migration-record-conflict:${mutation.key}`);
    });
    await writeRecordBatches(refs.records, initialMutations);

    const expectedCount = stateToRecordSpecs(migrationState).size;
    const verified = await readRecords(refs);
    if (verified.size !== expectedCount) throw new Error("migration-record-count-mismatch");
    const roundTrip = materializeValidatedRecords(verified);
    if (!areFinanceStatesEquivalent(migrationState, roundTrip)) throw new Error("migration-round-trip-mismatch");

    await firestoreMod.setDoc(refs.meta, {
      status: "active",
      migrationId: claimedMigrationId,
      migrationSourceHash: sourceHash,
      ownerDeviceId: deviceId,
      syncSchemaVersion: SYNC_SCHEMA_VERSION,
      stateSchemaVersion: CURRENT_SCHEMA_VERSION,
      recordCount: verified.size,
      updatedAt: firestoreMod.serverTimestamp(),
    });
  };

  return {
    refsFor,
    readMeta: (refs) => firestoreMod.getDoc(refs.meta),
    readLegacy: (refs) => firestoreMod.getDoc(refs.legacy),
    readRecords,
    serverTimestamp: () => firestoreMod.serverTimestamp(),
    listenRecords: (refs, onNext, onError) => firestoreMod.onSnapshot(
      refs.records,
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          onNext(mapSnapshotRecords(snapshot), snapshot.metadata || {});
        } catch (error) {
          onError(error);
        }
      },
      onError,
    ),
    writeMutationGroup: (refs, mutations) => writeRecordBatches(refs.records, mutations),
    activateMigration,
    clearPersistence: async () => {
      await firestoreMod.terminate(db);
      await firestoreMod.clearIndexedDbPersistence(db);
    },
  };
}
