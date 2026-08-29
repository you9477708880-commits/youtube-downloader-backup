import { deriveLifeRecordReminder } from "../../domain/life-record-reminder.js";
import { renderLifeRecordReminder } from "../../views/life-record-reminder-view.js";

export function createLifeRecordReminderController({
  elements,
  store,
  utils,
  now = () => new Date(),
  schedule = (callback) => setTimeout(callback, 200),
  cancelSchedule = (handle) => clearTimeout(handle),
}) {
  if (!elements?.query || !elements?.interval || !elements?.status || !elements?.summary || !elements?.results) {
    throw new Error("life-record-reminder-elements-required");
  }
  if (!store || typeof store.getState !== "function") throw new Error("life-record-reminder-store-required");
  if (!utils?.escapeHTML || !utils?.formatMoney) throw new Error("life-record-reminder-utils-required");

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
    const state = store.getState();
    const model = getModel();
    renderLifeRecordReminder({ model, accounts: state.accounts, elements, utils });
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
    elements.query.value = "";
    elements.interval.value = "";
    renderLifeRecordReminder({
      model: deriveLifeRecordReminder(),
      accounts: [],
      elements,
      utils,
    });
  }

  return { render, handleInput, reset, getModel };
}
