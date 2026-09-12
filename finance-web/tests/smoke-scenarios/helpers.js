import { STORAGE_KEYS } from "../../src/config/constants.js";

export function seedLegacyState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEYS.txs, JSON.stringify(state.txs));
  storage.setItem(STORAGE_KEYS.bsItems, JSON.stringify(state.bsI));
  storage.setItem(STORAGE_KEYS.wishes, JSON.stringify(state.wishes));
  storage.setItem(STORAGE_KEYS.sinkingFunds, JSON.stringify(state.sinkingFunds));
  storage.setItem(STORAGE_KEYS.accounts, JSON.stringify(state.accounts));
  storage.setItem(STORAGE_KEYS.userCats, JSON.stringify(state.userCats));
  storage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const smokeDate = localDateKey();
export const smokeMonth = smokeDate.slice(0, 7);

export function waitFor(check, timeoutMs = 3000) {
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }

      if (performance.now() - startedAt > timeoutMs) {
        reject(new Error("smoke-timeout"));
        return;
      }

      requestAnimationFrame(tick);
    };

    tick();
  });
}

export function writeSmokeResult(status, detail) {
  const scenarioName = new URLSearchParams(window.location.search).get("smoke") || "unknown-scenario";
  let result = document.getElementById("smoke-result");
  if (!result) {
    result = document.createElement("div");
    result.id = "smoke-result";
    result.hidden = true;
    document.body.append(result);
  }

  result.dataset.status = status;
  result.textContent = `${status.toUpperCase()} ${scenarioName}`;

  let detailNode = document.getElementById("smoke-detail");
  if (!detailNode) {
    detailNode = document.createElement("div");
    detailNode.id = "smoke-detail";
    detailNode.hidden = true;
    document.body.append(detailNode);
  }
  detailNode.textContent = detail;
}
