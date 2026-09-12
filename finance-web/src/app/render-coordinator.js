import { renderBalanceSheet, resetBalanceSheetView } from "../views/balance-sheet-view.js";
import { renderCashFlow } from "../views/cashflow-view.js";
import { renderGoalCenter } from "../views/goal-center-view.js";
import { renderLedger, resetLedgerView } from "../views/ledger-view.js";
import { refreshAccountOptions } from "../views/account-options-view.js";
import { renderMonthlyReview } from "../views/monthly-review-view.js";
import { renderOverview } from "../views/overview-view.js";
import { renderRetirement } from "../views/retirement-view.js";
import { renderWishlist } from "../views/wishlist-view.js";
import { createRenderModels } from "./render-models.js";

const DEFAULT_VIEWS = {
  renderBalanceSheet,
  renderCashFlow,
  renderGoalCenter,
  renderLedger,
  renderMonthlyReview,
  renderOverview,
  renderRetirement,
  renderWishlist,
};

export function createRenderCoordinator({
  store,
  dom,
  constants,
  utils,
  ui,
  getFilterRange,
  getFilteredTransactions,
  views = DEFAULT_VIEWS,
  refreshAccounts = refreshAccountOptions,
}) {
  let transactionSearchController = null;
  let lifeRecordReminderController = null;

  const renderBudgetOnly = () => {
    const state = store.getState();
    const filterRange = getFilterRange();
    const readModels = createRenderModels(state, filterRange);
    views.renderGoalCenter({ state, filterRange, utils, dom, readModels });
    views.renderWishlist({ state, filterRange, constants, utils, dom, readModels });
  };

  const renderRetirementOnly = () => {
    const state = store.getState();
    views.renderRetirement({ state, utils, dom, readModels: createRenderModels(state, getFilterRange()) });
  };

  const renderAll = () => {
    const state = store.getState();
    const filteredTxs = getFilteredTransactions();
    const filterRange = getFilterRange();
    const readModels = createRenderModels(state, filterRange);
    refreshAccounts({ state, utils });
    views.renderOverview({ state, filteredTxs, constants, utils, dom });
    views.renderMonthlyReview({ state, filterRange, utils, dom, readModels });
    if (transactionSearchController) transactionSearchController.render({ readModels });
    else views.renderLedger({ state, filteredTxs, constants, utils, dom, readModels, paginationKey: JSON.stringify(filterRange) });
    lifeRecordReminderController?.render();
    views.renderCashFlow({ state, filteredTxs, utils, dom });
    views.renderBalanceSheet({ state, utils, dom, readModels });
    views.renderGoalCenter({ state, filterRange, utils, dom, readModels });
    views.renderWishlist({ state, filterRange, constants, utils, dom, readModels });
    views.renderRetirement({ state, utils, dom, readModels });
  };

  const refreshWholeStateUi = () => {
    refreshAccounts({ state: store.getState(), utils, force: true });
    dom.goalCenter.dataset.filter = "all";
    ui.syncFromSettings();
    ui.renderTransactionCategorySelect();
    ui.populateCategoryBudgetOptions();
    ui.populateFundOptions();
    ui.syncTxType();
    renderAll();
  };

  return {
    bindFeatureControllers({ transactionSearch, lifeRecordReminder }) {
      transactionSearchController = transactionSearch;
      lifeRecordReminderController = lifeRecordReminder;
    },
    renderBudgetOnly,
    renderRetirementOnly,
    renderAll,
    refreshWholeStateUi,
    reset() {
      resetLedgerView(dom);
      resetBalanceSheetView(dom);
    },
    renderLedgerTransactions(transactions, { paginationKey = "", readModels } = {}) {
      views.renderLedger({
        state: store.getState(), filteredTxs: transactions, reportTxs: getFilteredTransactions(),
        constants, utils, dom, readModels,
        paginationKey: JSON.stringify([getFilterRange(), paginationKey]),
      });
    },
  };
}
