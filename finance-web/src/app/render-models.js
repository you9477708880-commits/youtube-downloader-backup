import { calculateAccountBalances, calculateBalanceSheet } from "../domain/accounts.js";
import { calculateBudgetData } from "../domain/budget.js";
import { getOpenAdvances } from "../domain/transactions.js";

// One render owns this model. Never retain it across commits, UID changes or ranges.
export function createRenderModels(state, range) {
  const values = new Map();
  const once = (key, calculate) => {
    if (!values.has(key)) values.set(key, calculate());
    return values.get(key);
  };
  return {
    get budget() { return once("budget", () => calculateBudgetData(state, range)); },
    get balances() { return once("balances", () => calculateAccountBalances(state)); },
    get openAdvances() { return once("openAdvances", () => getOpenAdvances(state.txs)); },
    get balanceSheet() {
      return once("balanceSheet", () => calculateBalanceSheet(state, {
        balances: this.balances, receivables: this.openAdvances,
      }));
    },
  };
}
