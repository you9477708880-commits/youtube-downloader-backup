export function monthKeyFromDate(date) {
  return String(date || "").slice(0, 7);
}

function monthToIndex(monthKey) {
  const [yearText, monthText] = String(monthKey || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return null;
  return year * 12 + (month - 1);
}

export function getRangeMonthBounds(range) {
  const startIndex = monthToIndex(monthKeyFromDate(range?.start));
  const endIndex = monthToIndex(monthKeyFromDate(range?.end));
  return { startIndex, endIndex };
}

export function countFundContributionMonths(fund, range) {
  const fundStart = monthToIndex(fund.startMonth);
  if (fundStart === null) return 0;

  const fundTarget = monthToIndex(fund.targetMonth);
  const { startIndex, endIndex } = getRangeMonthBounds(range);
  const effectiveStart = startIndex === null ? fundStart : Math.max(startIndex, fundStart);
  const effectiveEnd = endIndex === null ? (fundTarget ?? effectiveStart) : Math.min(endIndex, fundTarget ?? endIndex);

  if (effectiveEnd < effectiveStart) return 0;
  return effectiveEnd - effectiveStart + 1;
}

export function getFundPlannedContributionForRange(fund, range) {
  return countFundContributionMonths(fund, range) * (fund.monthlyContribution || 0);
}

export function getFundEventsInRange(fund, range, type = "") {
  const start = range?.start || "";
  const end = range?.end || "";
  return (fund.events || []).filter((event) => {
    if (type && event.type !== type) return false;
    if (!start || !end) return true;
    return event.date >= start && event.date <= end;
  });
}

export function getFundBalanceAsOf(fund, asOfMonth) {
  const asOfIndex = monthToIndex(asOfMonth);
  const fundStart = monthToIndex(fund.startMonth);
  if (asOfIndex === null || fundStart === null || asOfIndex < fundStart) return 0;

  const fundTarget = monthToIndex(fund.targetMonth);
  const finalIndex = fundTarget === null ? asOfIndex : Math.min(asOfIndex, fundTarget);
  const plannedMonths = Math.max(0, finalIndex - fundStart + 1);
  const plannedSaved = plannedMonths * (fund.monthlyContribution || 0);

  const eventDelta = (fund.events || [])
    .filter((event) => monthToIndex(monthKeyFromDate(event.date)) !== null && monthToIndex(monthKeyFromDate(event.date)) <= asOfIndex)
    .reduce((sum, event) => sum + (event.type === "topup" ? event.amount : event.type === "spend" ? -event.amount : 0), 0);

  return plannedSaved + eventDelta;
}

export function getFundSavedAmountAsOf(fund, asOfMonth) {
  return Math.max(0, getFundBalanceAsOf(fund, asOfMonth));
}

export function getFundAvailableBeforeExpense(fund, expenseDate, linkedTxId = null) {
  const expenseMonth = monthKeyFromDate(expenseDate);
  const asOfIndex = monthToIndex(expenseMonth);
  const fundStart = monthToIndex(fund.startMonth);
  if (asOfIndex === null || fundStart === null || asOfIndex < fundStart) return 0;

  const fundTarget = monthToIndex(fund.targetMonth);
  const finalIndex = fundTarget === null ? asOfIndex : Math.min(asOfIndex, fundTarget);
  const plannedMonths = Math.max(0, finalIndex - fundStart + 1);
  const plannedSaved = plannedMonths * (fund.monthlyContribution || 0);

  const eventDelta = (fund.events || [])
    .filter((event) => {
      if (!event?.date) return false;
      if (event.date < expenseDate) return true;
      if (event.date > expenseDate) return false;
      return !(event.type === "spend" && String(event.linkedTxId || "") === String(linkedTxId || ""));
    })
    .reduce((sum, event) => sum + (event.type === "topup" ? event.amount : event.type === "spend" ? -event.amount : 0), 0);

  return Math.max(0, plannedSaved + eventDelta);
}

export function getLinkedFundSpendAmount(fund, linkedTxId) {
  if (!linkedTxId) return 0;
  return (fund.events || [])
    .filter((event) => event.type === "spend" && String(event.linkedTxId || "") === String(linkedTxId))
    .reduce((sum, event) => sum + event.amount, 0);
}

export function withoutFundEventsLinkedToTransaction(funds, txId) {
  return (funds || []).map((fund) => ({
    ...fund,
    events: (fund.events || []).filter((event) => String(event.linkedTxId || "") !== String(txId)),
  }));
}

export function getFundTargetPlanStatus(fund) {
  const plannedAmount = getFundPlannedContributionForRange(fund, {
    start: `${fund.startMonth}-01`,
    end: fund.targetMonth ? `${fund.targetMonth}-31` : "",
  });
  const targetAmount = fund.targetAmount || 0;

  return {
    plannedAmount,
    targetAmount,
    shortfall: Math.max(0, targetAmount - plannedAmount),
    isFeasible: !targetAmount || plannedAmount >= targetAmount,
  };
}

export function summarizeFund(fund, range) {
  const asOfMonth = monthKeyFromDate(range?.end) || monthKeyFromDate(new Date().toISOString().slice(0, 10));
  const balance = getFundBalanceAsOf(fund, asOfMonth);
  const currentSaved = Math.max(0, balance);
  const targetAmount = fund.targetAmount || 0;
  const remaining = Math.max(0, targetAmount - currentSaved);
  const progress = targetAmount > 0 ? Math.min(100, (currentSaved / targetAmount) * 100) : 0;
  const plannedContribution = getFundPlannedContributionForRange(fund, range);
  const topupsInRange = getFundEventsInRange(fund, range, "topup");
  const spendsInRange = getFundEventsInRange(fund, range, "spend");
  const topupAmount = topupsInRange.reduce((sum, event) => sum + event.amount, 0);
  const spendAmount = spendsInRange.reduce((sum, event) => sum + event.amount, 0);

  return {
    ...fund,
    balance,
    currentSaved,
    remaining,
    overspentAmount: Math.max(0, -balance),
    progress,
    plannedContribution,
    topupsInRange,
    spendsInRange,
    topupAmount,
    spendAmount,
    suggestedTopup: Math.max(0, Math.min(remaining, fund.monthlyContribution || 0)),
  };
}
