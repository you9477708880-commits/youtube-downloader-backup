import { renderBalanceSheet } from "../views/balance-sheet-view.js";
import { renderCashFlow } from "../views/cashflow-view.js";
import { renderGoalCenter } from "../views/goal-center-view.js";
import { renderLedger } from "../views/ledger-view.js";
import { renderMonthlyReview } from "../views/monthly-review-view.js";
import { renderOverview } from "../views/overview-view.js";
import { renderRetirement } from "../views/retirement-view.js";
import { renderWishlist } from "../views/wishlist-view.js";

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
}) {
  let transactionSearchController = null;
  let lifeRecordReminderController = null;

  const renderBudgetOnly = () => {
    const state = store.getState();
    const filterRange = getFilterRange();
    views.renderGoalCenter({ state, filterRange, utils, dom });
    views.renderWishlist({ state, filterRange, constants, utils, dom });
  };

  const renderAll = () => {
    const state = store.getState();
    const filteredTxs = getFilteredTransactions();
    const filterRange = getFilterRange();
    views.renderOverview({ state, filteredTxs, constants, utils, dom });
    views.renderMonthlyReview({ state, filterRange, utils, dom });
    if (transactionSearchController) transactionSearchController.render();
    else views.renderLedger({ state, filteredTxs, constants, utils, dom });
    lifeRecordReminderController?.render();
    views.renderCashFlow({ state, filteredTxs, utils, dom });
    views.renderBalanceSheet({ state, utils, dom });
    views.renderGoalCenter({ state, filterRange, utils, dom });
    views.renderWishlist({ state, filterRange, constants, utils, dom });
    views.renderRetirement({ state, utils, dom });
  };

  const refreshWholeStateUi = () => {
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
    renderAll,
    refreshWholeStateUi,
    renderLedgerTransactions(transactions) {
      views.renderLedger({ state: store.getState(), filteredTxs: transactions, constants, utils, dom });
    },
  };
}
