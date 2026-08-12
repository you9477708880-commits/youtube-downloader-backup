import { resolvePresetRange } from "../domain/date-range.js";

export function createActions({ dom, renderAll, ui }) {
  return {
    switchTab(tabId) {
      ui.setActiveTab(tabId);
      if (tabId === "wl") ui.populateCategoryBudgetOptions();
      if (tabId === "lg") {
        ui.renderTransactionCategorySelect();
        ui.populateFundOptions();
      }
      renderAll();
    },

    setDatePreset(preset) {
      const range = resolvePresetRange(preset);
      dom.filterStart.value = range.start;
      dom.filterEnd.value = range.end;
      renderAll();
    },

    customDate() {
      dom.filterPreset.value = "custom";
      renderAll();
    },
  };
}
