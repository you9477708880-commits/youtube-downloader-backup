import assert from "node:assert/strict";
import { test } from "node:test";
import { canRepeatTransaction, prepareRepeatTransaction } from "../src/domain/transaction-repeat.js";

const source = { id: "tx", type: "income", amount: 300, cat: "薪资", acc: "a", date: "2020-01-01", desc: "收入", externalId: "external", updatedAt: "old", revision: 2 };
const stateFor = (tx) => ({ txs: [tx], accounts: [{ id: "a", name: "現金" }], sinkingFunds: [] });

test("repeat returns only explicitly allowed input fields with no record identity", () => {
  const state = stateFor(source);
  const before = structuredClone(state);
  assert.deepEqual(prepareRepeatTransaction({ state, id: "tx", date: "2026-09-22" }), {
    ok: true,
    input: { type: "income", amount: 300, desc: "收入", date: "2026-09-22", category: "薪资", subcategory: "未分類", accountId: "a" },
  });
  assert.deepEqual(state, before);
});

test("repeat rejects special types, forward links, reverse links and legacy spreading", () => {
  for (const patch of [
    { type: "transfer" }, { type: "balance_adjustment" }, { type: "advance" }, { type: "advance_repayment" },
    { linkedFundId: "f" }, { advanceId: "other" }, { budgetMode: "spread" },
  ]) {
    const tx = { ...source, ...patch };
    assert.equal(canRepeatTransaction(stateFor(tx), tx), false);
    assert.equal(prepareRepeatTransaction({ state: stateFor(tx), id: tx.id, date: "2026-09-22" }).ok, false);
  }
  const state = stateFor(source);
  state.sinkingFunds = [{ id: "f", events: [{ linkedTxId: "tx" }] }];
  assert.equal(canRepeatTransaction(state, source), false);
  state.sinkingFunds = [];
  state.txs.push({ id: "repay", type: "advance_repayment", advanceId: "tx" });
  assert.equal(canRepeatTransaction(state, source), false);
});

test("repeat uses canonical ids and leaves unavailable accounts unselected", () => {
  const tx = { ...source, id: 1, acc: "gone" };
  const state = stateFor(tx);
  assert.equal(prepareRepeatTransaction({ state, id: "1", date: "2026-09-22" }).input.accountId, "");
  tx.acc = "a";
  state.accounts[0].enabled = false;
  assert.equal(prepareRepeatTransaction({ state, id: "1", date: "2026-09-22" }).input.accountId, "");
  assert.equal(prepareRepeatTransaction({ state, id: "missing", date: "2026-09-22" }).ok, false);
});
