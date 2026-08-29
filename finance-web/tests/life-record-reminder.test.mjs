import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveLifeRecordReminder, deriveLifeRoutineCenter } from "../src/domain/life-record-reminder.js";

const today = new Date(2026, 7, 29);
const transactions = [
  { id: "dental-new-a", type: "expense", date: "2026-05-18", category: "醫療", subcategory: "牙科", desc: "例行洗牙", acc: "card" },
  { id: "dental-new-b", type: "expense", date: "2026-05-18", category: "醫療", subcategory: "牙科", desc: "洗牙掛號", acc: "cash" },
  { id: "dental-old", type: "expense", date: "2025-11-23", category: "醫療", subcategory: "牙科", desc: "洗牙與檢查", acc: "cash" },
  { id: "future", type: "expense", date: "2027-01-01", category: "醫療", subcategory: "牙科", desc: "洗牙預約", acc: "cash" },
];
const accounts = [{ id: "cash", name: "現金" }, { id: "card", name: "信用卡" }];

test("stays idle without a query and rejects non-positive or fractional intervals", () => {
  assert.equal(deriveLifeRecordReminder({ transactions, query: "", expectedIntervalDays: 180, today }).status, "idle");
  assert.equal(deriveLifeRecordReminder({ transactions, query: "洗牙", expectedIntervalDays: 0, today }).status, "invalid_interval");
  assert.equal(deriveLifeRecordReminder({ transactions, query: "洗牙", expectedIntervalDays: 180.5, today }).status, "invalid_interval");
  assert.equal(deriveLifeRecordReminder({ transactions, query: "洗牙", expectedIntervalDays: 3651, today }).status, "invalid_interval");
});

test("derives occurrences from distinct dates, excludes future records, and preserves source data", () => {
  const before = structuredClone(transactions);
  const model = deriveLifeRecordReminder({ transactions, accounts, query: "醫療 洗牙", expectedIntervalDays: 180, today });
  assert.equal(model.transactionCount, 3);
  assert.equal(model.occurrenceCount, 2);
  assert.deepEqual(model.occurrenceDates, ["2026-05-18", "2025-11-23"]);
  assert.equal(model.latestDate, "2026-05-18");
  assert.equal(model.daysSinceLatest, 103);
  assert.equal(model.averageIntervalDays, 176);
  assert.equal(model.nextExpectedDate, "2026-11-14");
  assert.equal(model.daysUntilNext, 77);
  assert.equal(model.status, "not_due");
  assert.deepEqual(model.recentTransactions.map((item) => item.id).sort(), ["dental-new-a", "dental-new-b", "dental-old"]);
  assert.deepEqual(transactions, before);
});

test("reports no matches and all three timing states at their boundaries", () => {
  const base = [{ id: "x", type: "expense", date: "2026-08-01", category: "生活", desc: "保養汽車", acc: "cash" }];
  assert.equal(deriveLifeRecordReminder({ transactions: base, query: "洗牙", expectedIntervalDays: 30, today }).status, "no_matches");
  assert.equal(deriveLifeRecordReminder({ transactions: base, query: "汽車", expectedIntervalDays: 58, today }).status, "due_soon");
  assert.equal(deriveLifeRecordReminder({ transactions: base, query: "汽車", expectedIntervalDays: 59, today }).status, "not_due");
  assert.equal(deriveLifeRecordReminder({ transactions: base, query: "汽車", expectedIntervalDays: 27, today }).status, "overdue");
});

test("adds calendar days safely across leap day and limits recent transactions", () => {
  const leapToday = new Date(2024, 1, 28);
  const model = deriveLifeRecordReminder({
    transactions: [
      { id: "1", type: "expense", date: "2024-02-28", desc: "檢查" },
      { id: "2", type: "expense", date: "2024-01-28", desc: "檢查" },
      { id: "3", type: "expense", date: "2023-12-28", desc: "檢查" },
    ],
    query: "檢查",
    expectedIntervalDays: 1,
    recentLimit: 2,
    today: leapToday,
  });
  assert.equal(model.nextExpectedDate, "2024-02-29");
  assert.equal(model.averageIntervalDays, 31);
  assert.deepEqual(model.recentTransactions.map((item) => item.id), ["1", "2"]);
});

test("saved routines derive alerts from transactions without duplicating or mutating them", () => {
  const before = structuredClone(transactions);
  const center = deriveLifeRoutineCenter({
    routines: [
      { id: "dental", name: "半年洗牙", query: "洗牙", expectedIntervalDays: 90, dueSoonDays: 14, enabled: true },
      { id: "disabled", name: "停用項目", query: "洗牙", expectedIntervalDays: 180, dueSoonDays: 14, enabled: false },
    ],
    transactions,
    accounts,
    today,
  });
  assert.equal(center.total, 2);
  assert.equal(center.overdue, 1);
  assert.equal(center.dueSoon, 0);
  assert.deepEqual(center.items.map((item) => item.reminder.status), ["overdue", "disabled"]);
  assert.deepEqual(transactions, before);
});

test("saved routines sort due work ahead of quiet or unmatched items", () => {
  const center = deriveLifeRoutineCenter({
    routines: [
      { id: "quiet", name: "年度洗牙", query: "洗牙", expectedIntervalDays: 365, dueSoonDays: 14, enabled: true },
      { id: "soon", name: "洗牙", query: "洗牙", expectedIntervalDays: 110, dueSoonDays: 14, enabled: true },
      { id: "missing", name: "健檢", query: "健檢", expectedIntervalDays: 365, dueSoonDays: 30, enabled: true },
    ],
    transactions,
    accounts,
    today,
  });
  assert.deepEqual(center.items.map((item) => item.routine.id), ["soon", "missing", "quiet"]);
  assert.equal(center.dueSoon, 1);
});
