import { compareTransactionsByDateDesc, getTransactionCategory, getTransactionSubcategory } from "./transactions.js";

const TYPE_LABELS = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  advance: "代墊",
  advance_repayment: "代墊還款",
  balance_adjustment: "帳戶調整",
};

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftMonths(date, amount) {
  const shifted = new Date(date.getFullYear(), date.getMonth(), 1);
  shifted.setMonth(shifted.getMonth() + amount);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(date.getDate(), lastDay));
  return shifted;
}

export function resolveTransactionSearchRange(preset, today = new Date(), customRange = {}) {
  if (preset === "all") return { start: "", end: "" };
  if (preset === "custom") {
    return { start: customRange.start || "", end: customRange.end || "" };
  }
  const months = preset === "1y" ? -12 : -6;
  return { start: localDateKey(shiftMonths(today, months)), end: localDateKey(today) };
}

function isInRange(date, range) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function daysBetween(later, earlier) {
  const laterTime = Date.parse(`${later}T00:00:00Z`);
  const earlierTime = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime)) return null;
  return Math.max(0, Math.round((laterTime - earlierTime) / 86400000));
}

function buildSearchableText(transaction, accountNames, fundNames) {
  const accountIds = transaction.type === "transfer"
    ? [transaction.fromAcc, transaction.toAcc]
    : [transaction.acc];
  const values = [
    transaction.desc,
    getTransactionCategory(transaction),
    getTransactionSubcategory(transaction),
    transaction.person,
    TYPE_LABELS[transaction.type] || transaction.type,
    ...accountIds.map((id) => accountNames.get(String(id || "")) || ""),
    fundNames.get(String(transaction.linkedFundId || "")) || "",
  ];
  return normalizeSearchText(values.filter(Boolean).join(" "));
}

export function searchTransactions({ transactions = [], accounts = [], funds = [], query, range = {}, today = new Date() }) {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery ? normalizedQuery.split(" ") : [];
  const accountNames = new Map(accounts.map((account) => [String(account.id), account.name || ""]));
  const fundNames = new Map(funds.map((fund) => [String(fund.id), fund.name || ""]));

  const matches = transactions
    .filter((transaction) => isInRange(transaction.date, range))
    .filter((transaction) => {
      if (!tokens.length) return true;
      const searchable = buildSearchableText(transaction, accountNames, fundNames);
      return tokens.every((token) => searchable.includes(token));
    })
    .sort(compareTransactionsByDateDesc);

  const latestDate = matches[0]?.date || "";
  const previousDate = matches[1]?.date || "";
  const todayKey = localDateKey(today);

  return {
    query: normalizedQuery,
    range: { start: range.start || "", end: range.end || "" },
    matches,
    matchCount: matches.length,
    latestDate,
    daysSinceLatest: latestDate ? daysBetween(todayKey, latestDate) : null,
    latestIntervalDays: latestDate && previousDate ? daysBetween(latestDate, previousDate) : null,
  };
}
