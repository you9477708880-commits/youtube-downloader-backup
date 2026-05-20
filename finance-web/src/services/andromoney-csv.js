import { DEFAULT_SUBCATEGORY } from "../config/constants.js";
import { createTransactionId } from "../domain/transactions.js";
import { toMoneyInt } from "../utils/format.js";

const ANDROMONEY_SOURCE = "andromoney";
const HEADER_ROW_INDEX = 1;
const DATA_START_INDEX = 2;
const ANDROMONEY_COLUMNS = ["Id", "幣別", "金額", "分類", "子分類", "日期", "付款(轉出)", "收款(轉入)", "備註", "Periodic", "專案", "商家(公司)", "uid", "時間"];

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function encodeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function formatCsvRows(rows) {
  return rows.map((row) => row.map(encodeCsvCell).join(",")).join("\r\n");
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return "";
}

function toAndroMoneyDate(value) {
  return String(value || "").replaceAll("-", "");
}

function rowToObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
}

function uniqueAccountNames(rows) {
  const names = new Set();
  rows.forEach((row) => {
    if (row["付款(轉出)"]) names.add(row["付款(轉出)"]);
    if (row["收款(轉入)"]) names.add(row["收款(轉入)"]);
  });
  return [...names].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function buildExternalTransactionId(row) {
  const externalId = String(row.Id || "").trim();
  return externalId ? `am-${externalId}` : createTransactionId("am");
}

function convertRowToTransaction(row, accountMap = {}) {
  const paymentAccountName = String(row["付款(轉出)"] || "").trim();
  const receivingAccountName = String(row["收款(轉入)"] || "").trim();
  const paymentAccountId = accountMap[paymentAccountName] || "";
  const receivingAccountId = accountMap[receivingAccountName] || "";
  const category = String(row["分類"] || "").trim() || DEFAULT_SUBCATEGORY;
  const subcategory = String(row["子分類"] || "").trim() || DEFAULT_SUBCATEGORY;
  const base = {
    id: buildExternalTransactionId(row),
    amount: Math.abs(toMoneyInt(row["金額"])),
    date: normalizeDate(row["日期"]),
    desc: String(row["備註"] || "").trim(),
    cat: category,
    category,
    subcategory,
    externalSource: ANDROMONEY_SOURCE,
    externalId: String(row.Id || "").trim(),
    externalUid: String(row.uid || "").trim(),
    externalTime: String(row["時間"] || "").trim(),
  };

  if (paymentAccountName && receivingAccountName) {
    return {
      ...base,
      type: "transfer",
      fromAcc: paymentAccountId,
      toAcc: receivingAccountId,
    };
  }

  if (receivingAccountName) {
    return {
      ...base,
      type: "income",
      acc: receivingAccountId,
    };
  }

  return {
    ...base,
    type: "expense",
    acc: paymentAccountId,
  };
}

export function parseAndroMoneyCsv(text, { accountMap = {} } = {}) {
  const rows = parseCsvRows(stripBom(text));
  const headers = rows[HEADER_ROW_INDEX] || [];
  const records = rows.slice(DATA_START_INDEX).map((row) => rowToObject(headers, row));
  const accountNames = uniqueAccountNames(records);
  const unmappedAccounts = accountNames.filter((name) => !accountMap[name]);
  const transactions = records
    .map((row) => convertRowToTransaction(row, accountMap))
    .filter((tx) => tx.amount > 0 && tx.date);

  return {
    source: ANDROMONEY_SOURCE,
    accountNames,
    unmappedAccounts,
    transactions,
  };
}

export function buildAndroMoneyCsv(transactions, accounts = [], { includeBom = true, generatedDate = new Date() } = {}) {
  const accountNameById = Object.fromEntries(accounts.map((account) => [account.id, account.name]));
  const headerDate = `${generatedDate.getFullYear()}${String(generatedDate.getMonth() + 1).padStart(2, "0")}${String(generatedDate.getDate()).padStart(2, "0")}`;
  const rows = [
    ["Google Documents", "理財幫手AndroMoney", headerDate],
    ANDROMONEY_COLUMNS,
    ...transactions
      .filter((tx) => ["income", "expense", "transfer"].includes(tx.type))
      .map((tx) => {
        const isTransfer = tx.type === "transfer";
        const isIncome = tx.type === "income";
        return [
          String(tx.externalId || tx.id || ""),
          "TWD",
          String(Math.abs(toMoneyInt(tx.amount))),
          isTransfer ? tx.category || tx.cat || "轉帳" : tx.category || tx.cat || DEFAULT_SUBCATEGORY,
          tx.subcategory || DEFAULT_SUBCATEGORY,
          toAndroMoneyDate(tx.date),
          isIncome ? "" : accountNameById[tx.fromAcc || tx.acc] || "",
          isIncome || isTransfer ? accountNameById[tx.toAcc || tx.acc] || "" : "",
          tx.desc || "",
          "",
          "",
          "",
          tx.externalUid || "",
          tx.externalTime || "",
        ];
      }),
  ];

  const csv = formatCsvRows(rows);
  return `${includeBom ? "\uFEFF" : ""}${csv}`;
}
