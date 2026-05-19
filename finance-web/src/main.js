import { bootstrapFinanceApp } from "./app/bootstrap.js";

document.addEventListener("DOMContentLoaded", () => {
  const smokeScenario = new URLSearchParams(window.location.search).get("smoke");

  if (smokeScenario) {
    import("./smoke-scenarios.js").then(async (scenarios) => {
      const prepareName = `prepare${smokeScenario
        .split("-")
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join("")}Scenario`;
      const runName = `run${smokeScenario
        .split("-")
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join("")}Scenario`;

      scenarios[prepareName]?.();
      const app = await bootstrapFinanceApp();
      await scenarios[runName]?.(app);
    });
    return;
  }

  bootstrapFinanceApp();
});
