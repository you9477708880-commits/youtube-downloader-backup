import assert from "node:assert/strict";
import { test } from "node:test";
import { createRetirementController } from "../src/app/controllers/retirement-controller.js";
import { createStore } from "../src/state/store.js";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    toggle(name, force) {
      if (force === undefined) {
        if (values.has(name)) values.delete(name);
        else values.add(name);
        return values.has(name);
      }
      if (force) values.add(name);
      else values.delete(name);
      return force;
    },
    contains: (name) => values.has(name),
  };
}

function node(value = "") {
  return { value, textContent: "", checked: false, disabled: false };
}

function createHarness({ linked = false, manualAsset = 120000 } = {}) {
  const store = createStore({
    settings: {
      retLinked: linked,
      retManualAsset: manualAsset,
      marker: "unchanged",
    },
  });
  const calls = { commit: 0, render: 0 };
  const elements = {
    linked: node(),
    manualWrap: { classList: createClassList(["opacity-50", "pointer-none"]) },
    currentAge: node("30"),
    retirementAge: node("65"),
    deathAge: node("90"),
    asset: node("0"),
    monthly: node("10000"),
    principalReturn: node("6"),
    contributionReturn: node("6"),
    inflation: node("2"),
    withdraw: node("40000"),
    target: node("20000000"),
    assetValue: node(),
    monthlyValue: node(),
    principalReturnValue: node(),
    contributionReturnValue: node(),
    inflationValue: node(),
    withdrawValue: node(),
    targetValue: node(),
    tableWrap: { classList: createClassList(["d-none"]) },
    tableToggleLabel: node("展開 ▼"),
  };
  const controller = createRetirementController({
    elements,
    store,
    commitState: (mutator, { updateUi }) => {
      calls.commit += 1;
      store.update(mutator);
      updateUi(store.getState());
    },
    renderAll: () => { calls.render += 1; },
    formatMoney: (value) => `money:${Number(value)}`,
    toMoneyInt: (value) => Math.round(Number(value) || 0),
  });
  return { store, calls, elements, controller };
}

test("syncs persisted retirement settings, linked UI, and projection labels without committing", () => {
  const { calls, elements, controller } = createHarness({ linked: true, manualAsset: 345000 });

  controller.syncFromSettings();

  assert.equal(elements.linked.checked, true);
  assert.equal(elements.asset.value, 345000);
  assert.equal(elements.asset.disabled, true);
  assert.equal(elements.manualWrap.classList.contains("opacity-50"), true);
  assert.equal(elements.manualWrap.classList.contains("pointer-none"), true);
  assert.equal(elements.assetValue.textContent, "money:345000");
  assert.equal(elements.monthlyValue.textContent, "money:10000");
  assert.equal(elements.principalReturnValue.textContent, "6.0%");
  assert.equal(elements.contributionReturnValue.textContent, "6.0%");
  assert.equal(elements.inflationValue.textContent, "2.0%");
  assert.equal(elements.withdrawValue.textContent, "money:40000");
  assert.equal(elements.targetValue.textContent, "money:20000000");
  assert.deepEqual(calls, { commit: 0, render: 0 });
});

test("linked setting is persisted once and updates only linked UI before rendering", () => {
  const { store, calls, elements, controller } = createHarness({ linked: false });
  elements.linked.checked = true;

  controller.updateLinked();

  assert.equal(store.getState().settings.retLinked, true);
  assert.equal(store.getState().settings.retManualAsset, 120000);
  assert.equal(store.getState().settings.marker, "unchanged");
  assert.equal(elements.asset.disabled, true);
  assert.equal(elements.manualWrap.classList.contains("opacity-50"), true);
  assert.deepEqual(calls, { commit: 1, render: 1 });
});

test("switching from linked to manual preserves the current slider value until a later settings sync", () => {
  const { store, calls, elements, controller } = createHarness({ linked: true, manualAsset: 120000 });
  elements.asset.value = "987000";
  elements.linked.checked = false;

  controller.updateLinked();

  assert.equal(store.getState().settings.retLinked, false);
  assert.equal(store.getState().settings.retManualAsset, 120000);
  assert.equal(elements.asset.value, "987000");
  assert.equal(elements.asset.disabled, false);
  assert.deepEqual(calls, { commit: 1, render: 1 });
});

test("manual asset input persists only while unlinked", () => {
  const manual = createHarness({ linked: false });
  manual.controller.updateInput("retireAsset", { target: { value: "1234.6" } });

  assert.equal(manual.elements.assetValue.textContent, "money:1235");
  assert.equal(manual.store.getState().settings.retManualAsset, 1235);
  assert.deepEqual(manual.calls, { commit: 1, render: 1 });

  const linked = createHarness({ linked: true, manualAsset: 120000 });
  linked.controller.updateInput("retireAsset", { target: { value: "777000" } });

  assert.equal(linked.elements.assetValue.textContent, "money:777000");
  assert.equal(linked.store.getState().settings.retManualAsset, 120000);
  assert.deepEqual(linked.calls, { commit: 0, render: 1 });
});

test("projection-only inputs and ages render without committing or changing state", () => {
  const { store, calls, elements, controller } = createHarness();
  const original = structuredClone(store.getState());
  const cases = [
    ["retireMonthly", "25000", elements.monthlyValue, "money:25000"],
    ["retirePrincipalReturn", "0", elements.principalReturnValue, "0.0%"],
    ["retireContributionReturn", "7.25", elements.contributionReturnValue, "7.3%"],
    ["retireInflation", "2.5", elements.inflationValue, "2.5%"],
    ["retireWithdraw", "50000", elements.withdrawValue, "money:50000"],
    ["retireTarget", "30000000", elements.targetValue, "money:30000000"],
  ];

  cases.forEach(([key, value, output, expected]) => {
    controller.updateInput(key, { target: { value } });
    assert.equal(output.textContent, expected);
  });
  controller.updateAge();
  controller.updateAge();
  controller.updateAge();

  assert.deepEqual(store.getState(), original);
  assert.equal(calls.commit, 0);
  assert.equal(calls.render, cases.length + 3);
});

test("preset changes only projection controls and renders once", () => {
  const { store, calls, elements, controller } = createHarness();
  const original = structuredClone(store.getState());

  controller.presetRet(8, 2.5);

  assert.equal(elements.principalReturn.value, 8);
  assert.equal(elements.principalReturnValue.textContent, "8.0%");
  assert.equal(elements.contributionReturn.value, 8);
  assert.equal(elements.contributionReturnValue.textContent, "8.0%");
  assert.equal(elements.inflation.value, 2.5);
  assert.equal(elements.inflationValue.textContent, "2.5%");
  assert.deepEqual(store.getState(), original);
  assert.deepEqual(calls, { commit: 0, render: 1 });
});

test("table expansion is UI-only and reset has no side effects", () => {
  const { store, calls, elements, controller } = createHarness();
  const original = structuredClone(store.getState());

  controller.toggleTable();
  assert.equal(elements.tableWrap.classList.contains("d-none"), false);
  assert.equal(elements.tableToggleLabel.textContent, "收合 ▲");
  controller.toggleTable();
  assert.equal(elements.tableWrap.classList.contains("d-none"), true);
  assert.equal(elements.tableToggleLabel.textContent, "展開 ▼");
  controller.reset();

  assert.deepEqual(store.getState(), original);
  assert.deepEqual(calls, { commit: 0, render: 0 });
});

test("a settings sync after whole-state replacement reads the new linked and manual values", () => {
  const { store, calls, elements, controller } = createHarness({ linked: true, manualAsset: 100 });
  controller.reset();
  store.replace({ settings: { retLinked: false, retManualAsset: 880000, marker: "new" } });

  controller.syncFromSettings();

  assert.equal(elements.linked.checked, false);
  assert.equal(elements.asset.value, 880000);
  assert.equal(elements.asset.disabled, false);
  assert.equal(elements.manualWrap.classList.contains("opacity-50"), false);
  assert.equal(elements.assetValue.textContent, "money:880000");
  assert.deepEqual(calls, { commit: 0, render: 0 });
});
