import { deriveLifeRoutineCenter } from "../../domain/life-record-reminder.js";
import { renderLifeRoutineCenter } from "../../views/life-record-reminder-view.js";

function defaultCreateId() {
  if (globalThis.crypto?.randomUUID) return `routine-${globalThis.crypto.randomUUID()}`;
  return `routine-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createLifeRecordReminderController({
  elements,
  store,
  commitState,
  toast,
  renderSearch,
  now = () => new Date(),
  createId = defaultCreateId,
  renderCenter = renderLifeRoutineCenter,
}) {
  if (!elements?.query || !elements?.name || !elements?.interval || !elements?.dueSoon || !elements?.list) {
    throw new Error("life-record-reminder-elements-required");
  }
  if (!store || typeof store.getState !== "function") throw new Error("life-record-reminder-store-required");
  if (typeof commitState !== "function" || typeof renderSearch !== "function") {
    throw new Error("life-record-reminder-actions-required");
  }

  let editingId = null;

  function clearForm() {
    editingId = null;
    elements.name.value = "";
    elements.interval.value = "";
    elements.dueSoon.value = "14";
    if (elements.cancel) elements.cancel.hidden = true;
    if (elements.save) elements.save.textContent = "儲存提醒";
  }

  function getModel() {
    const state = store.getState();
    return deriveLifeRoutineCenter({
      routines: state.lifeRoutines,
      transactions: state.txs,
      accounts: state.accounts,
      funds: state.sinkingFunds,
      today: now(),
    });
  }

  function render() {
    const model = getModel();
    renderCenter({ model, elements });
    return model;
  }

  function save() {
    const query = elements.query.value.normalize("NFKC").trim().replace(/\s+/g, " ");
    const name = elements.name.value.trim() || query;
    const expectedIntervalDays = Number(elements.interval.value);
    const dueSoonDays = Number(elements.dueSoon.value);
    if (!query) {
      toast?.show("請先在上方輸入要追蹤的搜尋關鍵字", "error");
      return false;
    }
    if (!Number.isInteger(expectedIntervalDays) || expectedIntervalDays < 1 || expectedIntervalDays > 3650) {
      toast?.show("預期間隔請輸入 1～3650 的完整天數", "error");
      return false;
    }
    if (!Number.isInteger(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 365) {
      toast?.show("提前提醒請輸入 0～365 的完整天數", "error");
      return false;
    }

    const timestamp = now().toISOString();
    const wasEditing = editingId !== null;
    commitState((draft) => {
      const existing = draft.lifeRoutines.find((routine) => String(routine.id) === String(editingId));
      if (existing) {
        Object.assign(existing, { name, query, expectedIntervalDays, dueSoonDays, updatedAt: timestamp });
        return;
      }
      draft.lifeRoutines.push({
        id: createId(),
        name,
        query,
        expectedIntervalDays,
        dueSoonDays,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }, {
      updateUi: () => {
        clearForm();
        render();
      },
    });
    toast?.show(wasEditing ? "已更新生活週期提醒" : "已儲存生活週期提醒");
    return true;
  }

  function beginEdit(id) {
    const routine = store.getState().lifeRoutines.find((item) => String(item.id) === String(id));
    if (!routine) return;
    editingId = routine.id;
    elements.query.value = routine.query;
    elements.name.value = routine.name;
    elements.interval.value = String(routine.expectedIntervalDays);
    elements.dueSoon.value = String(routine.dueSoonDays);
    if (elements.panel) elements.panel.open = true;
    if (elements.cancel) elements.cancel.hidden = false;
    if (elements.save) elements.save.textContent = "儲存修改";
    renderSearch();
    elements.name.focus?.();
  }

  function cancelEdit() {
    clearForm();
  }

  function remove(id) {
    const exists = store.getState().lifeRoutines.some((routine) => String(routine.id) === String(id));
    if (!exists) return;
    commitState((draft) => {
      draft.lifeRoutines = draft.lifeRoutines.filter((routine) => String(routine.id) !== String(id));
    }, {
      updateUi: () => {
        if (String(editingId) === String(id)) clearForm();
        render();
      },
    });
    toast?.show("已刪除生活週期提醒");
  }

  function toggle(id) {
    commitState((draft) => {
      const routine = draft.lifeRoutines.find((item) => String(item.id) === String(id));
      if (routine) {
        routine.enabled = routine.enabled === false;
        routine.updatedAt = now().toISOString();
      }
    }, { updateUi: render });
  }

  function view(id) {
    const routine = store.getState().lifeRoutines.find((item) => String(item.id) === String(id));
    if (!routine) return;
    elements.query.value = routine.query;
    renderSearch();
    elements.query.scrollIntoView?.({ behavior: "smooth", block: "center" });
    elements.query.focus?.();
  }

  function reset() {
    clearForm();
    if (elements.panel) elements.panel.open = false;
    render();
  }

  clearForm();
  return { render, save, beginEdit, cancelEdit, remove, toggle, view, reset, getModel };
}
