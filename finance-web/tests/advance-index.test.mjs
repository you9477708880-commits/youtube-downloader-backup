import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAdvanceRepaymentIndex, getAdvanceRepaidAmount, getOpenAdvances } from "../src/domain/transactions.js";

test("indexed open advances preserve original totals, string IDs, ordering, and default exclusions", () => {
  const txs = [
    { id: 7, type: "advance", receivableAmount: 100 },
    { id: "open", type: "advance", receivableAmount: 50 },
    { id: "paid", type: "advance", receivableAmount: 10 },
    { id: "empty", type: "advance" },
    { id: "r1", type: "advance_repayment", advanceId: "7", amount: 20 },
    { id: "r2", type: "advance_repayment", advanceId: 7, amount: 15 },
    { id: "", type: "advance_repayment", advanceId: 7, amount: 500 },
    { id: "r3", type: "advance_repayment", advanceId: "paid", amount: 20 },
    { id: "orphan", type: "advance_repayment", advanceId: "missing", amount: 99 },
    { id: "expense", type: "expense", advanceId: 7, amount: 400 },
  ];
  const original = structuredClone(txs);
  const expected = txs.filter((tx) => tx.type === "advance")
    .map((tx) => ({ ...tx, repaidAmount: getAdvanceRepaidAmount(txs, tx.id),
      outstandingAmount: Math.max(0, (tx.receivableAmount || 0) - getAdvanceRepaidAmount(txs, tx.id)) }))
    .filter((tx) => tx.outstandingAmount > 0);
  assert.deepEqual(getOpenAdvances(txs), expected);
  assert.deepEqual(getOpenAdvances(txs, buildAdvanceRepaymentIndex(txs)), expected);
  assert.deepEqual(expected.map(({ id, outstandingAmount }) => [id, outstandingAmount]), [[7, 65], ["open", 50]]);
  assert.deepEqual(txs, original);
});

test("a new calculation reflects added and edited repayments with no retained index", () => {
  const txs = [{ id: "a", type: "advance", receivableAmount: 100 }];
  assert.equal(getOpenAdvances(txs)[0].outstandingAmount, 100);
  txs.push({ id: "r", type: "advance_repayment", advanceId: "a", amount: 25 });
  assert.equal(getOpenAdvances(txs)[0].outstandingAmount, 75);
  txs[1].amount = 100;
  assert.deepEqual(getOpenAdvances(txs), []);
});
