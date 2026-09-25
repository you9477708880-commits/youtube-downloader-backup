import { activeAccounts } from "../domain/account-status.js";

const renderedOptions = new WeakMap();

// Form choices belong to account changes, not to transaction-list rendering.
export function refreshAccountOptions({ state, utils, root = document, force = false }) {
  const available = activeAccounts(state.accounts);
  const options = available.map((account) => `<option value="${utils.escapeHTML(account.id)}">${utils.escapeHTML(account.name)}${account.isEm ? " 🛡️緊急備用" : ""}</option>`).join("");
  const ids = new Set(available.map((account) => String(account.id)));
  root.querySelectorAll(".acc-opts").forEach((node) => {
    if (!force && renderedOptions.get(node) === options) return;
    const selected = node.value;
    node.innerHTML = options;
    if (!force && ids.has(selected)) node.value = selected;
    renderedOptions.set(node, options);
  });
}
