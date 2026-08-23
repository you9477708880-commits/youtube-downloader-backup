export function buildFinancialNavigation(review) {
  return {
    metrics: [
      { id: "income", label: "收入", value: review.income, note: "本期交易收入" },
      { id: "expense", label: "生活支出", value: review.budget.livingExpense, note: "沿用預算頁口徑" },
      { id: "assets", label: "資產", value: review.balanceSheet.totalAssets, note: "目前快照" },
      { id: "liabilities", label: "負債", value: review.balanceSheet.totalLiabilities, note: "目前快照" },
    ],
    questions: [
      "本期收入與生活支出是否反映你的實際生活安排？",
      "這個月有哪些支出值得保留，下個月最想調整哪一件事？",
    ],
  };
}
