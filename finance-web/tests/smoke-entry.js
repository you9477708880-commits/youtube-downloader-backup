import { bootstrapFinanceApp } from "../src/app/bootstrap.js";

function toScenarioExportName(prefix, scenarioName) {
  const suffix = scenarioName
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return `${prefix}${suffix}Scenario`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const smokeScenario = new URLSearchParams(window.location.search).get("smoke");
  if (!smokeScenario) {
    await bootstrapFinanceApp();
    return;
  }

  const scenarios = await import("../src/smoke-scenarios.js");
  const prepareName = toScenarioExportName("prepare", smokeScenario);
  const runName = toScenarioExportName("run", smokeScenario);

  if (typeof scenarios[prepareName] !== "function" || typeof scenarios[runName] !== "function") {
    throw new Error(`Unknown smoke scenario: ${smokeScenario}`);
  }

  try {
    scenarios[prepareName]();
    const app = await bootstrapFinanceApp();
    await scenarios[runName](app);
  } catch (error) {
    const result = document.createElement("div");
    result.id = "smoke-result";
    result.dataset.status = "fail";
    result.dataset.detail = error?.message || "smoke-bootstrap-failed";
    result.textContent = `FAIL ${smokeScenario}`;
    document.body.appendChild(result);
  }
});
