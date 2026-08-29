import { normalizeSearchText, searchTransactions } from "./transaction-search.js";

const DAY_MS = 86400000;

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyToTime(dateKey) {
  const time = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function daysBetween(later, earlier) {
  const laterTime = dateKeyToTime(later);
  const earlierTime = dateKeyToTime(earlier);
  if (laterTime === null || earlierTime === null) return null;
  return Math.round((laterTime - earlierTime) / DAY_MS);
}

function addDays(dateKey, days) {
  const time = dateKeyToTime(dateKey);
  if (time === null) return "";
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

function idleModel(query = "", intervalDays = null, status = "idle") {
  return {
    query,
    expectedIntervalDays: intervalDays,
    status,
    transactionCount: 0,
    occurrenceCount: 0,
    occurrenceDates: [],
    latestDate: "",
    daysSinceLatest: null,
    averageIntervalDays: null,
    nextExpectedDate: "",
    daysUntilNext: null,
    recentTransactions: [],
  };
}

export function deriveLifeRecordReminder({
  transactions = [],
  accounts = [],
  funds = [],
  query,
  expectedIntervalDays,
  today = new Date(),
  dueSoonDays = 30,
  recentLimit = 3,
} = {}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return idleModel();

  const intervalDays = Number(expectedIntervalDays);
  if (!Number.isInteger(intervalDays) || intervalDays <= 0 || intervalDays > 3650) {
    return idleModel(normalizedQuery, null, "invalid_interval");
  }

  const todayKey = localDateKey(today);
  const search = searchTransactions({
    transactions,
    accounts,
    funds,
    query: normalizedQuery,
    range: { start: "", end: todayKey },
    today,
  });
  const occurrenceDates = [...new Set(search.matches.map((transaction) => transaction.date))];
  if (!occurrenceDates.length) {
    return { ...idleModel(normalizedQuery, intervalDays, "no_matches"), expectedIntervalDays: intervalDays };
  }

  const intervals = occurrenceDates.slice(0, -1).map((date, index) => daysBetween(date, occurrenceDates[index + 1]));
  const validIntervals = intervals.filter((value) => Number.isFinite(value) && value >= 0);
  const averageIntervalDays = validIntervals.length
    ? Math.round(validIntervals.reduce((sum, value) => sum + value, 0) / validIntervals.length)
    : null;
  const latestDate = occurrenceDates[0];
  const nextExpectedDate = addDays(latestDate, intervalDays);
  const daysUntilNext = daysBetween(nextExpectedDate, todayKey);
  const status = daysUntilNext < 0 ? "overdue" : daysUntilNext <= dueSoonDays ? "due_soon" : "not_due";

  return {
    query: normalizedQuery,
    expectedIntervalDays: intervalDays,
    status,
    transactionCount: search.matchCount,
    occurrenceCount: occurrenceDates.length,
    occurrenceDates,
    latestDate,
    daysSinceLatest: search.daysSinceLatest,
    averageIntervalDays,
    nextExpectedDate,
    daysUntilNext,
    recentTransactions: search.matches.slice(0, Math.max(0, recentLimit)),
  };
}

const ROUTINE_STATUS_ORDER = {
  overdue: 0,
  due_soon: 1,
  no_matches: 2,
  not_due: 3,
  disabled: 4,
};

export function deriveLifeRoutineCenter({
  routines = [],
  transactions = [],
  accounts = [],
  funds = [],
  today = new Date(),
} = {}) {
  const items = routines.map((routine) => {
    if (routine.enabled === false) {
      return { routine, reminder: idleModel(routine.query, routine.expectedIntervalDays, "disabled") };
    }
    return {
      routine,
      reminder: deriveLifeRecordReminder({
        transactions,
        accounts,
        funds,
        query: routine.query,
        expectedIntervalDays: routine.expectedIntervalDays,
        dueSoonDays: routine.dueSoonDays,
        today,
      }),
    };
  }).sort((left, right) => {
    const statusDiff = (ROUTINE_STATUS_ORDER[left.reminder.status] ?? 9) - (ROUTINE_STATUS_ORDER[right.reminder.status] ?? 9);
    if (statusDiff) return statusDiff;
    const dateDiff = String(left.reminder.nextExpectedDate || "").localeCompare(String(right.reminder.nextExpectedDate || ""));
    return dateDiff || String(left.routine.name || left.routine.query).localeCompare(String(right.routine.name || right.routine.query), "zh-Hant");
  });

  return {
    items,
    total: items.length,
    overdue: items.filter((item) => item.reminder.status === "overdue").length,
    dueSoon: items.filter((item) => item.reminder.status === "due_soon").length,
    enabled: items.filter((item) => item.routine.enabled !== false).length,
  };
}
