import { resolveTransactionSearchRange, searchTransactions } from "../../domain/transaction-search.js";
import { renderTransactionSearch } from "../../views/transaction-search-view.js";

export function createTransactionSearchController({
  elements,
  store,
  getReportTransactions,
  renderTransactions,
  now = () => new Date(),
  schedule = (callback) => setTimeout(callback, 200),
  cancelSchedule = (handle) => clearTimeout(handle),
}) {
  if (!elements || !store || !getReportTransactions || !renderTransactions) {
    throw new Error("transaction-search-dependencies-required");
  }

  let pendingRender = null;

  function cancelPendingRender() {
    if (pendingRender !== null) cancelSchedule(pendingRender);
    pendingRender = null;
  }

  function getModel() {
    const state = store.getState();
    const query = elements.query.value;
    if (!query.trim()) {
      const reportTransactions = getReportTransactions();
      return {
        query: "",
        range: { start: "", end: "" },
        matches: reportTransactions,
        matchCount: reportTransactions.length,
        latestDate: "",
        daysSinceLatest: null,
        latestIntervalDays: null,
      };
    }
    const currentTime = now();
    const range = resolveTransactionSearchRange(elements.preset.value, currentTime, {
      start: elements.start.value,
      end: elements.end.value,
    });
    return searchTransactions({
      transactions: state.txs,
      accounts: state.accounts,
      funds: state.sinkingFunds,
      query,
      range,
      today: currentTime,
    });
  }

  function render() {
    const model = getModel();
    renderTransactionSearch({ model, elements });
    renderTransactions(model.matches);
    return model;
  }

  function handleQueryInput() {
    cancelPendingRender();
    pendingRender = schedule(() => {
      pendingRender = null;
      render();
    });
  }

  function handlePresetChange() {
    cancelPendingRender();
    if (elements.preset.value === "custom" && (!elements.start.value || !elements.end.value)) {
      const range = resolveTransactionSearchRange("6m", now());
      elements.start.value = range.start;
      elements.end.value = range.end;
    }
    render();
  }

  function clear() {
    cancelPendingRender();
    elements.query.value = "";
    elements.preset.value = "6m";
    elements.start.value = "";
    elements.end.value = "";
    render();
    elements.query.focus?.();
  }

  function reset() {
    cancelPendingRender();
    elements.query.value = "";
    elements.preset.value = "6m";
    elements.start.value = "";
    elements.end.value = "";
  }

  return { render, handleQueryInput, handlePresetChange, clear, reset, getModel };
}
