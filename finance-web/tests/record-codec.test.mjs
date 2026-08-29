import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import {
  applyMutations,
  buildRecordMutations,
  mapSnapshotRecords,
  recordEnvelopesToState,
  stateToRecordSpecs,
} from "../src/services/record-codec.js";
import { areFinanceStatesEquivalent } from "../src/services/sync-policy.js";

const state = createInitialState();
state.accounts = [{ id: "cash", name: "現金", type: "asset", isEm: false, initialBalance: 1000 }];
state.txs = [{
  id: "tx-1",
  type: "expense",
  amount: 200,
  date: "2026-07-31",
  desc: "午餐",
  cat: "餐飲食品",
  category: "餐飲食品",
  subcategory: "午餐",
  acc: "cash",
  linkedFundId: "fund-1",
}];
state.sinkingFunds = [{
  id: "fund-1",
  name: "旅行",
  category: "旅行",
  targetAmount: 10000,
  monthlyContribution: 1000,
  startMonth: "2026-01",
  targetMonth: "2026-12",
  events: [{
    id: "event-1",
    type: "spend",
    amount: 200,
    date: "2026-07-31",
    linkedTxId: "tx-1",
  }],
}];
state.wishes = [
  { id: 10, name: "第一個", price: 100, cat: "其他" },
  { id: 20, name: "第二個", price: 200, cat: "其他" },
];
state.lifeRoutines = [{
  id: "routine-1",
  name: "半年洗牙",
  query: "洗牙",
  expectedIntervalDays: 180,
  dueSoonDays: 14,
  enabled: true,
  createdAt: "2026-08-29T12:00:00.000Z",
  updatedAt: "2026-08-29T12:00:00.000Z",
}];

const initialMutations = buildRecordMutations(state, new Map(), {
  updatedBy: "device-a",
  updatedAt: "SERVER_TIME",
});
assert.ok(initialMutations.length > 0);
assert.ok(initialMutations.every((mutation) => mutation.envelope.revision === 1));

const baseline = applyMutations(new Map(), initialMutations);
const roundTrip = recordEnvelopesToState(baseline);
assert.equal(areFinanceStatesEquivalent(state, roundTrip), true);
assert.equal(roundTrip.sinkingFunds[0].events[0].linkedTxId, "tx-1");
assert.deepEqual(roundTrip.wishes.map((wish) => wish.id), [10, 20]);
assert.equal(roundTrip.lifeRoutines[0].query, "洗牙");

const changed = structuredClone(state);
changed.txs[0].amount = 250;
changed.wishes.splice(0, 1);
changed.lifeRoutines.splice(0, 1);
changed.txs.push({
  id: "tx-2",
  type: "income",
  amount: 500,
  date: "2026-07-31",
  desc: "回饋",
  cat: "其他收入",
  category: "其他收入",
  subcategory: "未分類",
  acc: "cash",
});
const nextMutations = buildRecordMutations(changed, baseline, {
  updatedBy: "device-a",
  updatedAt: "SERVER_TIME_2",
});
const update = nextMutations.find((mutation) => mutation.envelope.recordId === "tx-1");
const creation = nextMutations.find((mutation) => mutation.envelope.recordId === "tx-2");
const deletion = nextMutations.find((mutation) => mutation.envelope.recordId === "10");
const routineDeletion = nextMutations.find((mutation) => mutation.envelope.recordId === "routine-1");
assert.equal(update.envelope.revision, 2);
assert.equal(creation.envelope.revision, 1);
assert.equal(deletion.envelope.deleted, true);
assert.equal(deletion.envelope.payload, null);
assert.equal(routineDeletion.envelope.kind, "lifeRoutine");
assert.equal(routineDeletion.envelope.deleted, true);

const afterChanges = recordEnvelopesToState(applyMutations(baseline, nextMutations));
assert.equal(areFinanceStatesEquivalent(changed, afterChanges), true);

assert.throws(() => mapSnapshotRecords({
  forEach(callback) {
    callback({
      id: "wrong-key",
      data: () => initialMutations[0].envelope,
    });
  },
}), /invalid-cloud-record-key/);

console.log("Record codec tests passed");
