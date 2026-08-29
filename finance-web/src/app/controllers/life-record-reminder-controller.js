import { deriveLifeRecordReminder } from "../../domain/life-record-reminder.js";
import { renderLifeRecordReminder } from "../../views/life-record-reminder-view.js";

export function createLifeRecordReminderController({
  elements,
  store,
  now = () => new Date(),
  schedule = (callback) => setTimeout(callback, 200),
  cancelSchedule = (handle) => clearTimeout(handle),
}) {
  if (!elements?.query || !elements?.interval || !elements?.status || !elements?.summary) {
    throw new Error("life-record-reminder-elements-required");
  }
  if (!store || typeof store.getState !== "function") throw new Error("life-record-reminder-store-required");

  let pendingRender = null;

  function cancelPendingRender() {
    if (pendingRender !== null) cancelSchedule(pendingRender);
    pendingRender = null;
  }

  function getModel() {
    const state = store.getState();
    return deriveLifeRecordReminder({
      transactions: state.txs,
      accounts: state.accounts,
      funds: state.sinkingFunds,
      query: elements.query.value,
      expectedIntervalDays: elements.interval.value,
      today: now(),
    });
  }

  function render() {
    const model = getModel();
    renderLifeRecordReminder({ model, elements });
    return model;
  }

  function handleInput() {
    cancelPendingRender();
    pendingRender = schedule(() => {
      pendingRender = null;
      render();
    });
  }

  function reset() {
    cancelPendingRender();
    if (elements.panel) elements.panel.open = false;
    elements.interval.value = "";
    renderLifeRecordReminder({
      model: deriveLifeRecordReminder(),
      elements,
    });
  }

  return { render, handleInput, reset, getModel };
}
