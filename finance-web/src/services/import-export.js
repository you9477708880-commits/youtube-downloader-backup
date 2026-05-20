import { cloneState } from "../state/initial-state.js";
import { normalizeFinanceStateMoney } from "../utils/normalize-state.js";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const SAFE_STRING_MAX_LENGTH = 2000;
const SAFE_ID_MAX_LENGTH = 160;
const VALID_TX_TYPES = new Set(["income", "expense", "transfer", "advance", "advance_repayment"]);
const VALID_ACCOUNT_TYPES = new Set(["asset", "liability"]);
const VALID_FUND_EVENT_TYPES = new Set(["topup", "spend"]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasDangerousKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasDangerousKey(item));
  return Object.keys(value).some((key) => DANGEROUS_KEYS.has(key) || hasDangerousKey(value[key]));
}

function isSafeString(value, maxLength = SAFE_STRING_MAX_LENGTH) {
  return typeof value === "string" && value.length <= maxLength;
}

function isOptionalString(value, maxLength = SAFE_STRING_MAX_LENGTH) {
  return value === undefined || value === null || isSafeString(value, maxLength);
}

function isSafeId(value) {
  return (typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value)) || Number.isSafeInteger(value);
}

function isOptionalId(value) {
  return value === undefined || value === null || value === "" || isSafeId(value);
}

function isMoneyLike(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 40 && /^-?\d[\d,]*(?:\.\d+)?$/.test(value.trim());
  return false;
}

function isDateString(value) {
  if (!isSafeString(value, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isMonthString(value) {
  if (!isSafeString(value, 7) || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function isOptionalMonthString(value) {
  return value === undefined || value === null || value === "" || isMonthString(value);
}

function isValidTransaction(tx) {
  if (!isPlainObject(tx) || !isSafeId(tx.id) || !VALID_TX_TYPES.has(tx.type) || !isMoneyLike(tx.amount) || !isDateString(tx.date)) return false;
  if (!isOptionalString(tx.desc) || !isOptionalString(tx.cat) || !isOptionalString(tx.category, 200) || !isOptionalString(tx.subcategory, 200) || !isOptionalId(tx.acc) || !isOptionalId(tx.linkedFundId)) return false;
  if (!isOptionalId(tx.fromAcc) || !isOptionalId(tx.toAcc) || !isOptionalId(tx.advanceId)) return false;
  if (!isOptionalString(tx.person) || !isOptionalString(tx.spreadLabel)) return false;
  if ("ownAmount" in tx && !isMoneyLike(tx.ownAmount)) return false;
  if ("receivableAmount" in tx && !isMoneyLike(tx.receivableAmount)) return false;
  if ("spreadMonths" in tx && !Number.isSafeInteger(Number(tx.spreadMonths))) return false;
  return true;
}

function isValidAccount(account) {
  return (
    isPlainObject(account) &&
    isSafeId(account.id) &&
    isSafeString(account.name, 200) &&
    VALID_ACCOUNT_TYPES.has(account.type) &&
    isMoneyLike(account.initialBalance) &&
    (account.isEm === undefined || typeof account.isEm === "boolean")
  );
}

function isValidBalanceSheetItem(item) {
  return (
    isPlainObject(item) &&
    isSafeId(item.id) &&
    isSafeString(item.name, 200) &&
    (item.cat === "asset" || item.cat === "liability") &&
    isMoneyLike(item.amount) &&
    (item.isEm === undefined || typeof item.isEm === "boolean")
  );
}

function isValidWish(wish) {
  return isPlainObject(wish) && isSafeId(wish.id) && isSafeString(wish.name, 200) && isMoneyLike(wish.price) && isOptionalString(wish.cat, 200);
}

function isValidFundEvent(event) {
  return (
    isPlainObject(event) &&
    isSafeId(event.id) &&
    VALID_FUND_EVENT_TYPES.has(event.type) &&
    isMoneyLike(event.amount) &&
    isDateString(event.date) &&
    isOptionalId(event.linkedTxId) &&
    isOptionalString(event.note)
  );
}

function isValidSinkingFund(fund) {
  return (
    isPlainObject(fund) &&
    isSafeId(fund.id) &&
    isSafeString(fund.name, 200) &&
    isOptionalString(fund.category, 200) &&
    isMoneyLike(fund.targetAmount) &&
    isMoneyLike(fund.monthlyContribution) &&
    isMonthString(fund.startMonth) &&
    isOptionalMonthString(fund.targetMonth) &&
    (fund.carryoverEnabled === undefined || typeof fund.carryoverEnabled === "boolean") &&
    isOptionalString(fund.note) &&
    (!("events" in fund) || (Array.isArray(fund.events) && fund.events.every(isValidFundEvent)))
  );
}

function isValidUserCats(userCats) {
  return (
    isPlainObject(userCats) &&
    Array.isArray(userCats.income) &&
    userCats.income.every((item) => isSafeString(item, 200)) &&
    Array.isArray(userCats.expense) &&
    userCats.expense.every((item) => isSafeString(item, 200))
  );
}

function isValidSettings(settings) {
  return (
    isPlainObject(settings) &&
    (!("budgetCap" in settings) || isMoneyLike(settings.budgetCap)) &&
    (!("retManualAsset" in settings) || isMoneyLike(settings.retManualAsset)) &&
    (!("catBudgets" in settings) || (isPlainObject(settings.catBudgets) && Object.entries(settings.catBudgets).every(([key, value]) => isSafeString(key, 200) && isMoneyLike(value))))
  );
}

export function isValidImportShape(data) {
  if (!isPlainObject(data) || hasDangerousKey(data)) return false;
  if ("schemaVersion" in data && !Number.isSafeInteger(Number(data.schemaVersion))) return false;
  if (!Array.isArray(data.txs) || !data.txs.every(isValidTransaction)) return false;
  if (!Array.isArray(data.bsI) || !data.bsI.every(isValidBalanceSheetItem)) return false;
  if (!Array.isArray(data.accounts) || !data.accounts.every(isValidAccount)) return false;
  if (!Array.isArray(data.wishes) || !data.wishes.every(isValidWish)) return false;
  if ("sinkingFunds" in data && (!Array.isArray(data.sinkingFunds) || !data.sinkingFunds.every(isValidSinkingFund))) return false;
  return isValidSettings(data.settings) && isValidUserCats(data.userCats);
}

export function exportData(state) {
  const dataStr = JSON.stringify(state);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "finance_backup.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("missing-file"));
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      reject(new Error("file-too-large"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result || "{}");
        if (!isValidImportShape(imported)) {
          reject(new Error("invalid-schema"));
          return;
        }

        const cloned = normalizeFinanceStateMoney(cloneState(imported));
        if (!Array.isArray(cloned.sinkingFunds)) cloned.sinkingFunds = [];
        resolve(cloned);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsText(file);
  });
}
