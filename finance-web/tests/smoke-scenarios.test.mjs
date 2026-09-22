import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as scenarios from "./smoke-scenarios/index.js";
import { STORAGE_KEYS } from "../src/config/constants.js";

const names = [
  "FundShortfallChoice",
  "TransactionEditUnlinks",
  "FundEditRecalculates",
  "WishFundPrefill",
  "TransactionSubcategory",
  "AdvanceEditGuards",
  "RepaymentEdit",
  "AndroMoneyImport",
  "DesktopCoreLayout",
  "MonthlyReview",
  "CategoryBudgetCleanup",
  "EditingCompleteness",
  "ConflictRecoveryCenter",
  "AccountCenter",
  "TransactionSearch",
  "ListPerformance",
  "DailyOperations",
  "DailyOperationsMobile"
];

test("the original scenarios and daily operations retain their prepare/run contract", () => {
  assert.equal(names.length, 18);
  const expected = names.flatMap((name) => ["prepare" + name + "Scenario", "run" + name + "Scenario"]).sort();
  assert.deepEqual(Object.keys(scenarios).sort(), expected);
  for (const name of expected) assert.equal(typeof scenarios[name], "function");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const configured = pkg.scripts["test:smoke"].match(/--scenario=([^\s]+)/)[1].split(",").sort();
  assert.deepEqual(configured, names.map((name) => name.replace(/[A-Z]/g, (letter, offset) => (offset ? "-" : "") + letter.toLowerCase())).sort());
});

test("prepare functions preserve seeded and intentionally empty fixture contracts", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    for (const name of names) {
      const entries = new Map();
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { setItem: (key, value) => entries.set(key, value) },
      });
      scenarios["prepare" + name + "Scenario"]();
      if (name === "ConflictRecoveryCenter") {
        assert.equal(entries.size, 0, "recovery scenario intentionally uses an empty profile");
        continue;
      }
      assert.deepEqual([...entries.keys()].sort(), [
        STORAGE_KEYS.txs, STORAGE_KEYS.bsItems, STORAGE_KEYS.wishes, STORAGE_KEYS.sinkingFunds,
        STORAGE_KEYS.accounts, STORAGE_KEYS.userCats, STORAGE_KEYS.settings,
      ].sort(), name);
      assert.ok(Array.isArray(JSON.parse(entries.get(STORAGE_KEYS.txs))), name);
      assert.ok(JSON.parse(entries.get(STORAGE_KEYS.accounts)).length > 0, name);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("smoke fixtures live only in tests and production source never imports them", () => {
  const sourceRoot = new URL("../src/", import.meta.url);
  assert.equal(existsSync(new URL("smoke-scenarios.js", sourceRoot)), false);
  function checkDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) checkDirectory(path);
      else if (entry.name.endsWith(".js")) {
        assert.doesNotMatch(readFileSync(path, "utf8"), /(?:from\s*|import\s*\()\s*["'][^"']*(?:smoke-scenarios|\/tests\/)/, path);
      }
    }
  }
  checkDirectory(fileURLToPath(sourceRoot));
  assert.match(readFileSync(new URL("./smoke-entry.js", import.meta.url), "utf8"), /import\("\.\/smoke-scenarios\/index\.js"\)/);
});
