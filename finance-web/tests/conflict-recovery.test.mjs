import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createConflictRecoveryStore,
  createRecoveryPreserver,
  describeRecoveryDifferences,
  restoreRecoveryRecords,
} from "../src/services/conflict-recovery.js";
import { createInitialState } from "../src/state/initial-state.js";

function memoryDriver() {
  const records = new Map();
  return {
    records,
    async put(entry) { records.set(entry.id, structuredClone(entry)); },
    async get(id) { return structuredClone(records.get(id) || null); },
    async getAll() { return structuredClone([...records.values()]); },
    async delete(id) { records.delete(id); },
  };
}

function stateWithTransaction({ id = "tx-1", amount = 100, desc = "午餐" } = {}) {
  const state = createInitialState();
  state.txs = [{
    id,
    type: "expense",
    amount,
    desc,
    date: "2026-08-23",
    cat: "餐飲",
    category: "餐飲",
    subcategory: "午餐",
    acc: state.accounts[0].id,
  }];
  return state;
}

test("recovery entries are UID-scoped and keep only differing record keys", async () => {
  const driver = memoryDriver();
  const repository = createConflictRecoveryStore({
    driver,
    now: () => new Date("2026-08-23T10:00:00.000Z"),
    createId: () => "recovery-1",
  });
  const losing = stateWithTransaction({ amount: 100 });
  const winner = stateWithTransaction({ amount: 200 });

  const saved = await repository.save({
    scope: "uid:user-a",
    label: "before-cloud-conflict",
    state: losing,
    winnerState: winner,
    choice: "cloud",
    conflictType: "record",
  });

  assert.equal(saved.recordKeys.length, 1);
  assert.equal((await repository.list("uid:user-a")).length, 1);
  assert.equal((await repository.list("uid:user-b")).length, 0);
  assert.equal(await repository.get("recovery-1", "uid:user-b"), null);
});

test("retention removes entries older than 30 days and keeps at most 10 per scope", async () => {
  const driver = memoryDriver();
  let now = new Date("2026-08-23T10:00:00.000Z");
  let nextId = 0;
  const repository = createConflictRecoveryStore({
    driver,
    now: () => now,
    createId: () => `recovery-${++nextId}`,
  });
  const losing = stateWithTransaction({ amount: 100 });
  const winner = stateWithTransaction({ amount: 200 });

  await repository.save({ scope: "local", state: losing, winnerState: winner, createdAt: "2026-07-01T00:00:00.000Z" });
  now = new Date("2026-07-01T10:00:00.000Z");
  await repository.save({ scope: "uid:dormant-user", state: losing, winnerState: winner });
  now = new Date("2026-08-23T10:00:00.000Z");
  for (let index = 0; index < 12; index += 1) {
    now = new Date(Date.UTC(2026, 7, 23, 10, index));
    await repository.save({ scope: "local", state: losing, winnerState: winner });
  }

  const entries = await repository.list("local");
  assert.equal(entries.length, 10);
  assert.equal(entries.some((entry) => entry.createdAt.startsWith("2026-07-01")), false);
  assert.equal(entries[0].id, "recovery-14");
  assert.equal((await repository.list("uid:dormant-user")).length, 0);
});

test("selected recovery restores only chosen records and can reapply a deleted record", async () => {
  const current = stateWithTransaction({ amount: 500, desc: "目前午餐" });
  current.accounts[0].name = "目前現金";
  const recovered = stateWithTransaction({ amount: 100, desc: "舊午餐" });
  recovered.accounts[0].name = "舊現金";
  const driver = memoryDriver();
  const repository = createConflictRecoveryStore({ driver, createId: () => "recovery-restore" });
  const entry = await repository.save({ scope: "local", state: recovered, winnerState: current });
  const differences = describeRecoveryDifferences(entry, current);
  const transaction = differences.find((item) => item.kind === "transaction");
  const account = differences.find((item) => item.kind === "account");

  const restored = restoreRecoveryRecords(current, entry, [transaction.key]);
  assert.equal(restored.txs[0].amount, 100);
  assert.equal(restored.txs[0].desc, "舊午餐");
  assert.equal(restored.accounts[0].name, "目前現金");
  assert.ok(account);

  const deletedCurrent = structuredClone(current);
  deletedCurrent.txs = [];
  const deletionEntry = await repository.save({ scope: "local", state: recovered, winnerState: deletedCurrent });
  const deletedDifference = describeRecoveryDifferences(deletionEntry, deletedCurrent).find((item) => item.kind === "transaction");
  const restoredDeleted = restoreRecoveryRecords(deletedCurrent, deletionEntry, [deletedDifference.key]);
  assert.equal(restoredDeleted.txs[0].id, "tx-1");
});

test("fund recovery preserves parent-child consistency", () => {
  const recovered = createInitialState();
  recovered.sinkingFunds = [{
    id: "fund-1",
    name: "汽車保養",
    targetAmount: 10000,
    monthlyContribution: 1000,
    startMonth: "2026-08",
    targetMonth: "2027-05",
    carryoverEnabled: true,
    note: "",
    events: [{ id: "event-1", type: "contribution", amount: 1000, date: "2026-08-23" }],
  }];
  const emptyCurrent = createInitialState();
  const entry = {
    state: recovered,
    recordKeys: describeRecoveryDifferences({ state: recovered }, emptyCurrent).map((item) => item.key),
  };
  const eventKey = describeRecoveryDifferences(entry, emptyCurrent)
    .find((item) => item.kind === "fundEvent").key;
  const restoredEvent = restoreRecoveryRecords(emptyCurrent, entry, [eventKey]);
  assert.equal(restoredEvent.sinkingFunds.length, 1);
  assert.equal(restoredEvent.sinkingFunds[0].events.length, 1);

  const deletionEntry = {
    state: emptyCurrent,
    recordKeys: describeRecoveryDifferences({ state: emptyCurrent }, recovered).map((item) => item.key),
  };
  const fundKey = describeRecoveryDifferences(deletionEntry, recovered)
    .find((item) => item.kind === "sinkingFund").key;
  const restoredDeletion = restoreRecoveryRecords(recovered, deletionEntry, [fundKey]);
  assert.equal(restoredDeletion.sinkingFunds.length, 0);
});

test("scope validation and empty selections fail closed", async () => {
  const repository = createConflictRecoveryStore({ driver: memoryDriver() });
  await assert.rejects(repository.list("uid:"), /invalid-recovery-scope/);
  const current = stateWithTransaction();
  assert.throws(
    () => restoreRecoveryRecords(current, { state: current, recordKeys: [] }, []),
    /no-recovery-records-selected/,
  );
});

test("preserver downloads only when internal storage fails and blocks when both safeguards fail", async () => {
  const state = stateWithTransaction();
  const calls = [];
  const internalFailure = createRecoveryPreserver({
    recoveryStore: { save: async () => { throw new Error("quota"); } },
    getScope: () => "uid:user-a",
    exportEmergency: (_state, label) => calls.push(label),
    onEmergency: () => calls.push("emergency"),
  });
  assert.equal(await internalFailure(state, "before-cloud"), true);
  assert.deepEqual(calls, ["before-cloud", "emergency"]);

  const totalFailure = createRecoveryPreserver({
    recoveryStore: { save: async () => { throw new Error("quota"); } },
    getScope: () => "uid:user-a",
    exportEmergency: () => { throw new Error("download-failed"); },
  });
  assert.equal(await totalFailure(state, "before-local"), false);

  let exported = false;
  const internalSuccess = createRecoveryPreserver({
    recoveryStore: { save: async () => ({ id: "ok" }) },
    getScope: () => "uid:user-a",
    exportEmergency: () => { exported = true; },
  });
  assert.equal(await internalSuccess(state, "before-local"), true);
  assert.equal(exported, false);
});
