import { calculateAccountBalances, getAccountTransactionDelta } from "./accounts.js";

function configuredDay(value) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : 0;
}

function dateAtMonthDay(year, month, day) {
  return new Date(year, month, day);
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCreditCardSchedule(account, today = new Date()) {
  const statementDay = configuredDay(account?.statementDay);
  const paymentDueDay = configuredDay(account?.paymentDueDay);
  if (!statementDay && !paymentDueDay) return null;

  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let periodStart = null;
  let nextStatement = null;
  if (statementDay) {
    const thisStatement = dateAtMonthDay(todayDate.getFullYear(), todayDate.getMonth(), statementDay);
    const lastStatement = todayDate >= thisStatement
      ? thisStatement
      : dateAtMonthDay(todayDate.getFullYear(), todayDate.getMonth() - 1, statementDay);
    nextStatement = dateAtMonthDay(lastStatement.getFullYear(), lastStatement.getMonth() + 1, statementDay);
    periodStart = new Date(lastStatement);
    periodStart.setDate(periodStart.getDate() + 1);
  }

  let nextPaymentDue = null;
  if (paymentDueDay) {
    // This is a calendar reminder, not the due date of the next statement or proof of an unpaid bill.
    nextPaymentDue = dateAtMonthDay(todayDate.getFullYear(), todayDate.getMonth(), paymentDueDay);
    if (nextPaymentDue < todayDate) {
      nextPaymentDue = dateAtMonthDay(todayDate.getFullYear(), todayDate.getMonth() + 1, paymentDueDay);
    }
  }

  return {
    periodStart: periodStart ? localDateString(periodStart) : "",
    periodEnd: nextStatement ? localDateString(nextStatement) : "",
    nextStatementDate: nextStatement ? localDateString(nextStatement) : "",
    nextPaymentDueDate: nextPaymentDue ? localDateString(nextPaymentDue) : "",
  };
}

export function calculateAccountCenter(state, today = new Date(), shared = {}) {
  const balances = shared.balances ?? calculateAccountBalances(state);
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const todayText = localDateString(today);
  const accounts = state.accounts.map((account) => {
    const balance = balances[account.id] || 0;
    const transactions = state.txs.filter((tx) => getAccountTransactionDelta(tx, account.id) !== 0);
    const schedule = account.type === "liability" ? getCreditCardSchedule(account, today) : null;
    const periodTransactions = schedule?.periodStart
      ? transactions.filter((tx) => tx.date >= schedule.periodStart && tx.date <= todayText)
      : [];
    const monthDeltas = transactions
      .filter((tx) => tx.type !== "balance_adjustment" && tx.date >= monthStart && tx.date <= todayText)
      .map((tx) => getAccountTransactionDelta(tx, account.id));
    const periodCharges = periodTransactions
      .filter((tx) => (tx.type === "expense" || tx.type === "advance") && String(tx.acc) === String(account.id))
      .reduce((sum, tx) => sum + tx.amount, 0);
    const periodPayments = periodTransactions
      .filter((tx) => tx.type === "transfer" && String(tx.toAcc) === String(account.id))
      .reduce((sum, tx) => sum + tx.amount, 0);
    const debt = Math.max(0, -balance);
    const creditLimit = Math.max(0, Number(account.creditLimit) || 0);

    return {
      ...account,
      balance,
      debt,
      creditLimit,
      availableCredit: creditLimit ? Math.max(0, creditLimit - debt) : 0,
      transactionCount: transactions.length,
      monthInflow: monthDeltas.filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0),
      monthOutflow: Math.abs(monthDeltas.filter((amount) => amount < 0).reduce((sum, amount) => sum + amount, 0)),
      periodCharges,
      periodPayments,
      schedule,
      transactions,
    };
  });

  return { balances, accounts };
}
