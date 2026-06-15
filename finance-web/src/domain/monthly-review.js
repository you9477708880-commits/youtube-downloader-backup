import { calculateBalanceSheet } from "./accounts.js";
import { calculateBudgetData } from "./budget.js";
import { summarizeCashFlow, summarizeOverview } from "./transactions.js";

function isDateInRange(date, range) {
  const { start, end } = range || {};
  if (!start || !end) return true;
  return date >= start && date <= end;
}

function describeBudgetSourceType(type) {
  if (type === "living-expense") return "生活支出";
  if (type === "fund-plan") return "準備提撥";
  if (type === "fund-topup") return "手動補入";
  return "其他";
}

export function calculateMonthlyReviewData(state, range) {
  const txsInRange = (state.txs || []).filter((tx) => isDateInRange(tx.date, range));
  const overview = summarizeOverview(txsInRange);
  const cashFlow = summarizeCashFlow(txsInRange);
  const budget = calculateBudgetData(state, range);
  const balanceSheet = calculateBalanceSheet(state);
  const fundSpend = budget.funds.reduce((sum, fund) => sum + fund.spendAmount, 0);
  const fundNetChange = budget.fundContribution + budget.manualTopups - fundSpend;
  const requiredBudgetUse = budget.livingExpense + budget.fundContribution + budget.manualTopups;
  const budgetShortfall = Math.max(0, requiredBudgetUse - budget.cap);
  const budgetUseItems = budget.sourceItems
    .filter((item) => item.amount > 0)
    .map((item) => ({
      id: item.id,
      type: item.type,
      typeLabel: describeBudgetSourceType(item.type),
      date: item.date,
      title: item.title,
      subtitle: item.subtitle,
      amount: item.amount,
    }))
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : String(b.date || "").localeCompare(String(a.date || ""))))
    .slice(0, 5);

  const prompts = [];
  if (!txsInRange.length) prompts.push("本期沒有交易，先確認篩選月份是否正確。");
  if (!budget.cap) prompts.push("本月可支配預算尚未設定，月度回顧只能顯示交易與資產快照。");
  if (budgetShortfall > 0) prompts.push("本月生活支出、準備提撥與手動補入已超過可支配預算。");
  if (fundSpend > 0) prompts.push("本月有動用大額準備，請確認對應交易與準備事件是否符合預期。");
  if (overview.income > 0 && requiredBudgetUse > overview.income) prompts.push("本月預算使用額高於本月收入，請確認是否有動用存款或跨月安排。");
  if (balanceSheet.netWorth < 0) prompts.push("目前淨值為負數，資產負債頁需要優先檢查。");
  if (!prompts.length) prompts.push("本月沒有明顯需要立即檢查的提示。");

  return {
    range: {
      start: range?.start || "",
      end: range?.end || "",
    },
    txCount: txsInRange.length,
    income: overview.income,
    ledgerExpense: overview.expense,
    ledgerNet: overview.net,
    cashFlow,
    budget: {
      cap: budget.cap,
      livingExpense: budget.livingExpense,
      fundContribution: budget.fundContribution,
      manualTopups: budget.manualTopups,
      freeToUse: budget.freeToUse,
      requiredBudgetUse,
      budgetShortfall,
    },
    funds: {
      spend: fundSpend,
      netChange: fundNetChange,
    },
    budgetUseItems,
    balanceSheet: {
      totalAssets: balanceSheet.totalAssets,
      totalLiabilities: balanceSheet.totalLiabilities,
      netWorth: balanceSheet.netWorth,
      receivableTotal: balanceSheet.receivableTotal,
    },
    prompts,
    sourceNotes: [
      "收入與帳本支出來自 txs。",
      "生活支出沿用預算頁計算，已排除大額準備覆蓋的部分。",
      "大額準備提撥、補入與動用來自 sinkingFunds.events 與既有準備規劃。",
      "資產負債是目前快照，不代表本月變化。",
    ],
  };
}
