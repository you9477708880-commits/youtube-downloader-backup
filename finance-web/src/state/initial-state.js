import { CURRENT_SCHEMA_VERSION, DEFAULT_ACCOUNTS, DEFAULT_SETTINGS } from "../config/constants.js";

export function createInitialState() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    txType: "expense",
    txs: [],
    bsI: [],
    wishes: [],
    sinkingFunds: [],
    lifeRoutines: [],
    userCats: { income: [], expense: [] },
    accounts: DEFAULT_ACCOUNTS.map((account) => ({ ...account })),
    settings: {
      ...DEFAULT_SETTINGS,
      catBudgets: { ...DEFAULT_SETTINGS.catBudgets },
    },
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
