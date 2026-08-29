import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyDeleteTransaction,
  applyDetailTransaction,
  applyMainTransaction,
  planFundAllocation,
  prepareAdvanceRepaymentEdit,
  prepareDetailTransaction,
  prepareMainTransaction,
  prepareNewAdvanceRepayment,
} from "../src/domain/transaction-commands.js";
import { createInitialState } from "../src/state/initial-state.js";

function createState(overrides = {}) {
  const base = createInitialState();
  return {
    ...base,
    txType: "expense",
    txs: [],
    sinkingFunds: [],
    accounts: [
      { id: "cash", name: "現金", type: "asset", initialBalance: 0 },
      { id: "bank", name: "銀行", type: "asset", initialBalance: 0 },
    ],
    settings: { ...base.settings, budgetCap: 10000 },
    ...overrides,
  };
}

function fund(events = []) {
  return {
    id: "fund-1",
    name: "旅遊",
    category: "其他",
    targetAmount: 30000,
    monthlyContribution: 0,
    startMonth: "2026-08",
    targetMonth: "",
    carryoverEnabled: true,
    events,
  };
}

function mainInput(overrides = {}) {
  return {
    amount: "600",
    desc: "午餐",
    date: "2026-08-15",
    category: "餐飲",
    subcategory: "便當",
    accountId: "cash",
    fromAcc: "cash",
    toAcc: "bank",
    ownAmount: "0",
    person: "",
    linkedFundId: "",
    ...overrides,
  };
}

test("main transaction command validates transfer and advance invariants without mutating state", () => {
  const transferState = createState({ txType: "transfer" });
  const transferBefore = structuredClone(transferState);
  const transfer = prepareMainTransaction({ state: transferState, input: mainInput({ toAcc: "cash" }) });
  assert.equal(transfer.code, "same_transfer_account");
  assert.deepEqual(transferState, transferBefore);

  const advanceState = createState({ txType: "advance" });
  const advance = prepareMainTransaction({
    state: advanceState,
    input: mainInput({ amount: "1000", ownAmount: "1000", person: "小明" }),
  });
  assert.equal(advance.code, "advance_without_receivable");
});

test("fund allocation command keeps top-up, partial, and unlink accounting distinct", () => {
  const state = createState({ sinkingFunds: [fund()] });
  const prepared = prepareMainTransaction({ state, input: mainInput({ amount: "600", linkedFundId: "fund-1" }) });
  assert.equal(prepared.ok, true);
  const request = planFundAllocation(prepared);
  assert.equal(request.needsChoice, true);
  assert.equal(request.request.shortfall, 600);

  const topup = planFundAllocation({ ...prepared, choice: "topup" });
  assert.deepEqual(
    { topupAmount: topup.topupAmount, fundSpendAmount: topup.fundSpendAmount, linkedFundId: topup.effectiveLinkedFundId },
    { topupAmount: 600, fundSpendAmount: 600, linkedFundId: "fund-1" },
  );
  const draft = structuredClone(state);
  let nextId = 0;
  applyMainTransaction(draft, { ...prepared, ...topup, tx: topup.tx }, () => `event-${++nextId}`);
  assert.equal(draft.txs.length, 1);
  assert.deepEqual(draft.sinkingFunds[0].events.map((event) => [event.type, event.amount]), [["topup", 600], ["spend", 600]]);

  const partialState = createState({ sinkingFunds: [fund([{ id: "seed", type: "topup", amount: 200, date: "2026-08-01" }])] });
  const partialPrepared = prepareMainTransaction({ state: partialState, input: mainInput({ amount: "600", linkedFundId: "fund-1" }) });
  const partial = planFundAllocation({ ...partialPrepared, choice: "partial" });
  assert.equal(partial.fundSpendAmount, 200);
  const unlink = planFundAllocation({ ...partialPrepared, choice: "unlink" });
  assert.equal(unlink.effectiveLinkedFundId, "");
  assert.equal("linkedFundId" in unlink.tx, false);
});

test("detail command preserves provenance and only keeps a stable expense fund link", () => {
  const original = {
    id: "tx-1",
    type: "expense",
    amount: 600,
    date: "2026-08-15",
    category: "餐飲",
    subcategory: "午餐",
    cat: "餐飲",
    acc: "cash",
    desc: "舊值",
    linkedFundId: "fund-1",
    externalSource: "andromoney",
    externalId: "external-1",
  };
  const state = createState({
    txs: [original],
    sinkingFunds: [fund([{ id: "spend-1", type: "spend", amount: 600, date: "2026-08-15", linkedTxId: "tx-1", note: "舊值" }])],
  });
  const command = prepareDetailTransaction({
    state,
    original,
    input: { type: "expense", amount: "600", date: "2026-08-15", category: "餐飲", subcategory: "晚餐", accountId: "bank", desc: "新值" },
  });
  assert.equal(command.keepsFundLink, true);
  assert.equal(command.next.externalId, "external-1");
  const draft = structuredClone(state);
  applyDetailTransaction(draft, command);
  assert.equal(draft.txs[0].linkedFundId, "fund-1");
  assert.equal(draft.sinkingFunds[0].events[0].note, "新值");

  const changed = prepareDetailTransaction({
    state,
    original,
    input: { type: "expense", amount: "700", date: "2026-08-15", category: "餐飲", subcategory: "午餐", accountId: "cash", desc: "改金額" },
  });
  const changedDraft = structuredClone(state);
  applyDetailTransaction(changedDraft, changed);
  assert.equal("linkedFundId" in changedDraft.txs[0], false);
  assert.deepEqual(changedDraft.sinkingFunds[0].events, []);
});

test("delete and repayment commands preserve advance relationships", () => {
  const advance = {
    id: "adv-1", type: "advance", amount: 5000, ownAmount: 1000, receivableAmount: 4000,
    date: "2026-08-01", acc: "cash", person: "小明", category: "餐飲", subcategory: "聚餐",
  };
  const repayment = {
    id: "repay-1", type: "advance_repayment", advanceId: "adv-1", amount: 1000,
    date: "2026-08-05", acc: "cash", person: "小明",
  };
  const state = createState({ txs: [advance, repayment] });
  const created = prepareNewAdvanceRepayment({ state, advanceId: "adv-1", amount: "500", accountId: "bank", date: "2026-08-10" });
  assert.equal(created.ok, true);
  assert.equal(created.repayment.advanceId, "adv-1");
  assert.equal(created.repayment.type, "advance_repayment");

  const edited = prepareAdvanceRepaymentEdit({ state, repaymentId: "repay-1", amount: "1200", date: "2026-08-07", accountId: "bank" });
  assert.equal(edited.ok, true);
  assert.deepEqual(edited.changes, { amount: 1200, date: "2026-08-07", acc: "bank" });

  const draft = structuredClone(state);
  applyDeleteTransaction(draft, advance);
  assert.deepEqual(draft.txs, []);
});
