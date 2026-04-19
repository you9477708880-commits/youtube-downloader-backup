export function buildTransaction({ txType, amount, desc, date, category, accountId, fromAcc, toAcc }) {
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
  } else {
    tx.acc = accountId;
    tx.cat = category;
  }

  return tx;
}

export function groupTransactionsByDate(txs) {
  const sorted = [...txs].sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.id - a.id));
  const groups = new Map();

  sorted.forEach((tx) => {
    if (!groups.has(tx.date)) groups.set(tx.date, { inc: 0, exp: 0, txs: [] });
    const group = groups.get(tx.date);
    group.txs.push(tx);
    if (tx.type === "income") group.inc += tx.amount;
    else if (tx.type === "expense") group.exp += tx.amount;
  });

  return groups;
}

export function summarizeOverview(txs) {
  const income = txs.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = txs.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  return {
    income,
    expense,
    net: income - expense,
  };
}

export function summarizeExpenseCategories(txs) {
  const expenseMap = {};
  txs.filter((tx) => tx.type === "expense").forEach((tx) => {
    expenseMap[tx.cat] = (expenseMap[tx.cat] || 0) + tx.amount;
  });
  return Object.entries(expenseMap).sort((a, b) => b[1] - a[1]);
}

export function summarizeCashFlow(txs) {
  const operatingIncome = txs
    .filter((tx) => ["薪資", "獎金", "副業收入", "其他收入"].includes(tx.cat))
    .reduce((sum, tx) => sum + tx.amount, 0);
  const operatingExpense = txs.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const investingIncome = txs
    .filter((tx) => ["投資收益", "租金收入"].includes(tx.cat))
    .reduce((sum, tx) => sum + tx.amount, 0);

  return {
    operatingIncome,
    operatingExpense,
    investingIncome,
    netOperating: operatingIncome - operatingExpense,
    netTotal: operatingIncome - operatingExpense + investingIncome,
  };
}
