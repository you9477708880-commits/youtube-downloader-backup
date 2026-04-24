export function buildTransaction({
  txType,
  amount,
  desc,
  date,
  category,
  accountId,
  fromAcc,
  toAcc,
  ownAmount,
  person,
  budgetMode,
  spreadMonths,
  spreadStartMonth,
  spreadLabel,
}) {
  const tx = {
    id: Date.now(),
    type: txType,
    amount: Math.round(amount || 0),
    desc: desc.trim(),
    date,
  };

  if (txType === "transfer") {
    tx.fromAcc = fromAcc;
    tx.toAcc = toAcc;
    tx.cat = "轉帳";
  } else if (txType === "advance") {
    const own = Math.max(0, Math.round(ownAmount || 0));
    tx.acc = accountId;
    tx.cat = category;
    tx.ownAmount = Math.min(own, tx.amount);
    tx.receivableAmount = Math.max(0, tx.amount - tx.ownAmount);
    tx.person = person.trim() || "未指定";
  } else {
    tx.acc = accountId;
    tx.cat = category;
    if (txType === "expense" && budgetMode === "spread") {
      tx.budgetMode = "spread";
      tx.spreadMonths = Math.max(2, Math.round(spreadMonths || 0));
      tx.spreadStartMonth = spreadStartMonth || date.slice(0, 7);
      tx.spreadLabel = (spreadLabel || "").trim();
    }
  }

  return tx;
}

export function buildAdvanceRepayment({ advanceId, amount, date, accountId, person }) {
  return {
    id: Date.now(),
    type: "advance_repayment",
    advanceId,
    amount: Math.round(amount || 0),
    date,
    acc: accountId,
    cat: "代墊收款",
    desc: `${person || "對方"} 還款`,
    person: person || "未指定",
  };
}

export function getPersonalExpenseAmount(tx) {
  if (tx.type === "expense") return tx.amount;
  if (tx.type === "advance") return tx.ownAmount ?? tx.amount;
  return 0;
}

export function isBudgetSpreadTx(tx) {
  return tx?.type === "expense" && tx?.budgetMode === "spread" && Number(tx?.spreadMonths) >= 2 && /^\d{4}-\d{2}$/.test(tx?.spreadStartMonth || "");
}

export function getAdvanceRepayments(txs, advanceId) {
  return txs.filter((tx) => tx.type === "advance_repayment" && String(tx.advanceId) === String(advanceId));
}

export function getAdvanceOutstanding(txs, advanceTx) {
  const repaid = getAdvanceRepayments(txs, advanceTx.id).reduce((sum, tx) => sum + tx.amount, 0);
  return Math.max(0, (advanceTx.receivableAmount || 0) - repaid);
}

export function getOpenAdvances(txs) {
  return txs
    .filter((tx) => tx.type === "advance" && getAdvanceOutstanding(txs, tx) > 0)
    .map((tx) => ({
      ...tx,
      repaidAmount: getAdvanceRepayments(txs, tx.id).reduce((sum, repayment) => sum + repayment.amount, 0),
      outstandingAmount: getAdvanceOutstanding(txs, tx),
    }));
}

export function groupTransactionsByDate(txs) {
  const sorted = [...txs].sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.id - a.id));
  const groups = new Map();

  sorted.forEach((tx) => {
    if (!groups.has(tx.date)) groups.set(tx.date, { inc: 0, exp: 0, txs: [] });
    const group = groups.get(tx.date);
    group.txs.push(tx);
    if (tx.type === "income") group.inc += tx.amount;
    else group.exp += getPersonalExpenseAmount(tx);
  });

  return groups;
}

export function summarizeOverview(txs) {
  const income = txs.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = txs.reduce((sum, tx) => sum + getPersonalExpenseAmount(tx), 0);
  return {
    income,
    expense,
    net: income - expense,
  };
}

export function summarizeExpenseCategories(txs) {
  const expenseMap = {};
  txs.forEach((tx) => {
    const expense = getPersonalExpenseAmount(tx);
    if (expense <= 0) return;
    expenseMap[tx.cat] = (expenseMap[tx.cat] || 0) + expense;
  });
  return Object.entries(expenseMap).sort((a, b) => b[1] - a[1]);
}

export function summarizeCashFlow(txs) {
  const operatingIncome = txs
    .filter((tx) => ["薪資", "獎金", "其他收入", "被動收入"].includes(tx.cat))
    .reduce((sum, tx) => sum + tx.amount, 0);
  const operatingExpense = txs.reduce((sum, tx) => sum + getPersonalExpenseAmount(tx), 0);
  const investingIncome = txs
    .filter((tx) => ["投資收益", "股息收入"].includes(tx.cat))
    .reduce((sum, tx) => sum + tx.amount, 0);

  return {
    operatingIncome,
    operatingExpense,
    investingIncome,
    netOperating: operatingIncome - operatingExpense,
    netTotal: operatingIncome - operatingExpense + investingIncome,
  };
}
