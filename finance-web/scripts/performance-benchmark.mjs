// Synthetic, in-memory benchmarks only. Never reads browser or Firebase data.
// Usage: node scripts/performance-benchmark.mjs [baseline-git-ref]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getOpenAdvances } from "../src/domain/transactions.js";
import { createImportController } from "../src/app/controllers/import-controller.js";

const root = new URL("../", import.meta.url);
const baseline = process.argv[2] || "b8454c4";
async function loadBaseline(relativePath) {
  const fileUrl = new URL(relativePath, root);
  const source = execFileSync("git", ["show", `${baseline}:finance-web/${relativePath}`], {
    cwd: fileURLToPath(root), encoding: "utf8", windowsHide: true,
  }).replace(/from\s+(["'])(\.[^"']+)\1/g, (_match, _quote, path) => `from ${JSON.stringify(new URL(path, fileUrl).href)}`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
const oldTransactions = await loadBaseline("src/domain/transactions.js");
const oldImport = await loadBaseline("src/app/controllers/import-controller.js");

function advanceFixture(size) {
  return Array.from({ length: size }, (_, index) => {
    const base = { id: `tx-${index}`, amount: 100, date: "2026-09-01" };
    if (index % 10 === 0) return { ...base, type: "advance", receivableAmount: 80, ownAmount: 20 };
    if (index % 10 === 1) return { ...base, type: "advance_repayment", advanceId: `tx-${index - 1}`, amount: 30 };
    return { ...base, type: "expense" };
  });
}

function csvFixture(size) {
  const existing = Array.from({ length: size }, (_, index) => ({
    id: `local-${index}`, externalSource: "andromoney", externalId: String(index + 1),
    type: "expense", amount: 100, acc: "cash", date: "2026-09-01", desc: "original",
  }));
  const imported = existing.map((tx) => ({ ...tx, id: `import-${tx.externalId}`, acc: "bank", amount: 101 }));
  return { existing, imported };
}

async function csvTrial(createController, fixture, mode) {
  const state = { txs: [...fixture.existing], sinkingFunds: [], accounts: [
    { id: "cash", name: "現金", type: "asset" }, { id: "bank", name: "銀行", type: "asset" },
  ] };
  const classList = { add() {}, remove() {}, toggle() {} };
  const element = () => ({ classList, innerHTML: "", textContent: "", value: "" });
  const elements = Object.fromEntries([
    "androMoneyModal", "androMoneySummary", "androMoneyAccounts", "androMoneyDuplicates",
    "androMoneyDuplicateMode", "androMoneyPreview", "androMoneyConfirm",
  ].map((key) => [key, element()]));
  elements.androMoneyAccounts.querySelectorAll = () => [];
  const controller = createController({
    elements, store: { getState: () => state }, toast: { show() {} },
    commitState: (mutator, { updateUi }) => { mutator(state); updateUi(); },
    refreshTransactionUi() {}, waitForCloudSave: async () => false,
    readTextFile: async () => "synthetic-csv",
    parseAndroMoneyCsv: () => ({ accountNames: ["銀行"], transactions: fixture.imported }),
    formatMoney: String, escapeHTML: String,
  });
  await controller.openAndroMoneyImport({});
  elements.androMoneyDuplicateMode.value = mode;
  return { run: () => controller.confirmAndroMoneyImport(), result: () => state };
}

async function measure(setup) {
  const durations = [];
  let result;
  for (let index = 0; index < 4; index += 1) {
    const trial = await setup();
    const start = performance.now();
    await trial.run();
    const elapsed = performance.now() - start;
    result = trial.result();
    if (index > 0) durations.push(elapsed);
  }
  durations.sort((a, b) => a - b);
  return { milliseconds: durations[1], result };
}

const rows = [];
for (const size of [450, 5000, 20000]) {
  const txs = advanceFixture(size);
  const advanceTrial = (fn) => () => {
    let result;
    return { run: () => { result = fn(txs); }, result: () => result };
  };
  const before = await measure(advanceTrial(oldTransactions.getOpenAdvances));
  const after = await measure(advanceTrial(getOpenAdvances));
  assert.deepEqual(after.result, before.result);
  rows.push({ task: "open advances (10% advances, 10% repayments)", size, beforeMs: before.milliseconds, afterMs: after.milliseconds });
  const fixture = csvFixture(size);
  for (const mode of ["repair-accounts", "update"]) {
    const oldCsv = await measure(() => csvTrial(oldImport.createImportController, fixture, mode));
    const newCsv = await measure(() => csvTrial(createImportController, fixture, mode));
    assert.deepEqual(newCsv.result, oldCsv.result);
    rows.push({ task: `CSV confirm ${mode} (100% duplicates)`, size, beforeMs: oldCsv.milliseconds, afterMs: newCsv.milliseconds });
  }
}
console.log(JSON.stringify({
  baseline, node: process.version, samples: 3, warmupRuns: 1,
  scope: "Median in-memory computation. CSV parse, disk/cloud persistence and DOM painting excluded. Baseline target files use current shared dependencies.",
  equality: "All complete result objects equal baseline.",
  rows: rows.map((row) => ({ ...row, beforeMs: +row.beforeMs.toFixed(3), afterMs: +row.afterMs.toFixed(3) })),
}, null, 2));
