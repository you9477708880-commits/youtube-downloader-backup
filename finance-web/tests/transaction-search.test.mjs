import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeSearchText,
  resolveTransactionSearchRange,
  searchTransactions,
} from "../src/domain/transaction-search.js";

const today = new Date(2026, 7, 13);
const transactions = [
  { id: "dental-new", type: "expense", amount: 200, date: "2026-05-18", category: "醫療", subcategory: "牙科", desc: "例行洗牙", acc: "card" },
  { id: "car", type: "expense", amount: 3200, date: "2026-03-01", category: "交通", subcategory: "汽車", desc: "定期保養", acc: "card", linkedFundId: "car-fund" },
  { id: "dental-old", type: "expense", amount: 150, date: "2025-11-23", category: "醫療", subcategory: "牙科", desc: "洗牙與檢查", acc: "cash" },
  { id: "advance", type: "advance", amount: 1000, date: "2026-07-01", category: "聚餐", subcategory: "晚餐", desc: "朋友聚會", person: "小明", acc: "cash" },
  { id: "transfer", type: "transfer", amount: 5000, date: "2026-06-01", category: "轉帳", subcategory: "未分類", desc: "旅行存款", fromAcc: "cash", toAcc: "bank" },
];
const accounts = [
  { id: "cash", name: "現金" },
  { id: "card", name: "信用卡" },
  { id: "bank", name: "銀行帳戶" },
];
const funds = [{ id: "car-fund", name: "汽車維護準備" }];

test("normalizes full-width text, case, and whitespace without changing source data", () => {
  assert.equal(normalizeSearchText("  ＣＡＲ   Service  "), "car service");
  assert.equal(normalizeSearchText(null), "");
});

test("resolves six-month, one-year, all, and custom ranges with calendar-safe dates", () => {
  assert.deepEqual(resolveTransactionSearchRange("6m", new Date(2026, 7, 31)), { start: "2026-02-28", end: "2026-08-31" });
  assert.deepEqual(resolveTransactionSearchRange("1y", today), { start: "2025-08-13", end: "2026-08-13" });
  assert.deepEqual(resolveTransactionSearchRange("all", today), { start: "", end: "" });
  assert.deepEqual(resolveTransactionSearchRange("custom", today, { start: "2026-01-01", end: "2026-02-01" }), { start: "2026-01-01", end: "2026-02-01" });
});

test("searches multiple terms across category, note, account, person, transfer accounts, and fund name", () => {
  const base = { transactions, accounts, funds, range: { start: "", end: "" }, today };
  assert.deepEqual(searchTransactions({ ...base, query: "醫療 洗牙" }).matches.map((tx) => tx.id), ["dental-new", "dental-old"]);
  assert.deepEqual(searchTransactions({ ...base, query: "信用卡 保養" }).matches.map((tx) => tx.id), ["car"]);
  assert.deepEqual(searchTransactions({ ...base, query: "汽車維護" }).matches.map((tx) => tx.id), ["car"]);
  assert.deepEqual(searchTransactions({ ...base, query: "小明 代墊" }).matches.map((tx) => tx.id), ["advance"]);
  assert.deepEqual(searchTransactions({ ...base, query: "現金 銀行" }).matches.map((tx) => tx.id), ["transfer"]);
});

test("applies inclusive dates and reports latest occurrence intervals without mutation", () => {
  const before = structuredClone(transactions);
  const result = searchTransactions({
    transactions,
    accounts,
    funds,
    query: "洗牙",
    range: { start: "2025-11-23", end: "2026-05-18" },
    today,
  });
  assert.equal(result.matchCount, 2);
  assert.equal(result.latestDate, "2026-05-18");
  assert.equal(result.daysSinceLatest, 87);
  assert.equal(result.latestIntervalDays, 176);
  assert.deepEqual(transactions, before);
});

test("excludes invalid dates and internal AndroMoney identifiers from ordinary search", () => {
  const result = searchTransactions({
    transactions: [
      { id: "bad", type: "expense", date: "not-a-date", desc: "洗牙", category: "醫療" },
      { id: "am", type: "expense", date: "2026-05-01", desc: "午餐", category: "餐飲", externalId: "secret-6542", externalUid: "uid-private" },
    ],
    query: "secret-6542",
    range: { start: "", end: "" },
    today,
  });
  assert.equal(result.matchCount, 0);
});
