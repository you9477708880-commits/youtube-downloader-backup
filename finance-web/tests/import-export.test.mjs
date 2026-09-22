import assert from "node:assert/strict";
import { importData, isValidImportShape } from "../src/services/import-export.js";
import { stateToRecordSpecs } from "../src/services/record-codec.js";
import { createInitialState } from "../src/state/initial-state.js";

const tx = (id) => ({ id, type: "expense", amount: 100, date: "2026-09-22", desc: "private-note", acc: "cash" });
const event = (id) => ({ id, type: "topup", amount: 100, date: "2026-09-22" });
const fund = (id, events = []) => ({ id, name: "準備", targetAmount: 1000, monthlyContribution: 100, startMonth: "2026-01", events });
const routine = (id) => ({ id, name: "提醒", query: "洗牙", expectedIntervalDays: 180, dueSoonDays: 14, enabled: true });
const rows = [
  ["txs", "transaction", tx],
  ["accounts", "account", (id) => ({ id, name: "帳戶", type: "asset", initialBalance: 0 })],
  ["bsI", "balanceSheetItem", (id) => ({ id, name: "資產", cat: "asset", amount: 0 })],
  ["wishes", "wish", (id) => ({ id, name: "願望", price: 100 })],
  ["sinkingFunds", "sinkingFund", fund],
  ["lifeRoutines", "lifeRoutine", routine],
];

const OriginalFileReader = globalThis.FileReader;
globalThis.FileReader = class {
  readAsText(file) { this.onload({ target: { result: file.text } }); }
};
const read = (state) => importData({ size: 1, text: JSON.stringify(state) });

async function assertDuplicate(state, kind, locations) {
  const before = structuredClone(state);
  assert.equal(isValidImportShape(state), false, `${kind} duplicate must fail import validation`);
  assert.throws(() => stateToRecordSpecs(state), /duplicate-record-id/);
  await assert.rejects(read(state), (error) => {
    assert.equal(error.code, "duplicate-record-id");
    assert.equal(error.message, "duplicate-record-id");
    assert.equal(error.kind, kind);
    assert.deepEqual(error.locations, locations);
    assert.match(error.userMessage, /識別碼重複/);
    assert.match(error.userMessage, /未匯入/);
    locations.forEach((location) => assert.ok(error.userMessage.includes(location)));
    assert.ok(!error.userMessage.includes("private-note"));
    return true;
  });
  assert.deepEqual(state, before, "validation never repairs IDs or mutates the source");
}

try {
  for (const [field, kind, make] of rows) {
    for (const [first, second] of [["duplicate", "duplicate"], [1, "1"]]) {
      const state = createInitialState();
      state[field] = [make(first), make(second)];
      await assertDuplicate(state, kind, [`${field}[0]`, `${field}[1]`]);
    }
  }
  const sameFundEvents = createInitialState();
  sameFundEvents.sinkingFunds = [fund("fund", [event(1), event("1")])];
  await assertDuplicate(sameFundEvents, "fundEvent", ["sinkingFunds[0].events[0]", "sinkingFunds[0].events[1]"]);

  const compositeCollision = createInitialState();
  compositeCollision.sinkingFunds = [fund("a:b", [event("c")]), fund("a", [event("b:c")])];
  await assertDuplicate(compositeCollision, "fundEvent", ["sinkingFunds[0].events[0]", "sinkingFunds[1].events[0]"]);

  const valid = createInitialState();
  rows.forEach(([field, , make]) => { valid[field] = [make("shared")]; });
  valid.sinkingFunds = [fund("shared", [event(1)]), fund("other", [event("1")])];
  assert.equal(isValidImportShape(valid), true, "kinds and different fund parents isolate identities");
  const imported = await read(valid);
  assert.doesNotThrow(() => stateToRecordSpecs(imported));
  assert.equal(imported.txs[0].id, "shared");
  assert.equal(imported.sinkingFunds[0].events[0].id, 1);

  const legacy = createInitialState();
  delete legacy.schemaVersion;
  delete legacy.lifeRoutines;
  delete legacy.sinkingFunds;
  legacy.txs = [tx(1), tx("01")];
  assert.equal(isValidImportShape(legacy), true, "numeric and distinct padded string IDs remain valid");
  const normalized = await read(legacy);
  assert.deepEqual(normalized.sinkingFunds, []);
  assert.deepEqual(normalized.lifeRoutines, []);
  assert.doesNotThrow(() => stateToRecordSpecs(normalized));
  await assert.rejects(read({ ...legacy, txs: [{ ...tx(1), amount: {} }] }), /invalid-schema/);
  await assert.rejects(importData({ size: 1, text: "{" }), SyntaxError);
  await assert.rejects(importData({ size: 6 * 1024 * 1024, text: "{}" }), /file-too-large/);
  console.log("import-export identity tests passed");
} finally {
  if (OriginalFileReader === undefined) delete globalThis.FileReader;
  else globalThis.FileReader = OriginalFileReader;
}
