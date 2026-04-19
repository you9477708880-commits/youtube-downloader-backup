import { STORAGE_KEYS } from "../config/constants.js";
import { cloneState } from "../state/initial-state.js";

export function loadLocalState(baseState) {
  const next = cloneState(baseState);

  try {
    const txs = localStorage.getItem(STORAGE_KEYS.txs);
    const bsItems = localStorage.getItem(STORAGE_KEYS.bsItems);
    const wishes = localStorage.getItem(STORAGE_KEYS.wishes);
    const accounts = localStorage.getItem(STORAGE_KEYS.accounts);
    const userCats = localStorage.getItem(STORAGE_KEYS.userCats);
    const settings = localStorage.getItem(STORAGE_KEYS.settings);

    if (txs) next.txs = JSON.parse(txs);
    if (bsItems) next.bsI = JSON.parse(bsItems);
    if (wishes) next.wishes = JSON.parse(wishes);
    if (accounts) next.accounts = JSON.parse(accounts);
    if (userCats) next.userCats = JSON.parse(userCats);
    if (settings) next.settings = { ...next.settings, ...JSON.parse(settings) };
  } catch (error) {
    console.warn("Local storage load failed.", error);
  }

  return next;
}

export function saveLocalState(state) {
  localStorage.setItem(STORAGE_KEYS.txs, JSON.stringify(state.txs));
  localStorage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(state.bsI));
  localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(state.wishes));
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(state.accounts));
  localStorage.setItem(STORAGE_KEYS.userCats, JSON.stringify(state.userCats));
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}
