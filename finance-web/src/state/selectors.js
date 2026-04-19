export function getFilterRange(doc) {
  return {
    start: doc.getElementById("f-start")?.value || "",
    end: doc.getElementById("f-end")?.value || "",
  };
}

export function getFilteredTransactions(state, range) {
  const { start, end } = range;
  if (!start || !end) return state.txs;
  return state.txs.filter((tx) => tx.date >= start && tx.date <= end);
}
