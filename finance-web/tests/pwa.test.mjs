import assert from "node:assert/strict";
import test from "node:test";
import { setupPWA } from "../src/services/pwa.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    (this.listeners.get(type) || []).forEach((listener) => listener(event));
  }
}

class FakeClassList {
  constructor(...values) {
    this.values = new Set(values);
  }

  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

function button() {
  const target = new FakeEventTarget();
  return {
    ...target,
    listeners: target.listeners,
    addEventListener: target.addEventListener.bind(target),
    dispatch: target.dispatch.bind(target),
    disabled: false,
    textContent: "",
    click() { target.dispatch("click", { target: this }); },
  };
}

function createHarness({ active = {} } = {}) {
  const banner = { classList: new FakeClassList("d-none") };
  const updateNow = button();
  const updateLater = button();
  const nodes = new Map([
    ["pwa-update-banner", banner],
    ["pwa-update-now", updateNow],
    ["pwa-update-later", updateLater],
  ]);
  const manifest = { rel: "", href: "" };
  const doc = {
    querySelector: () => null,
    createElement: () => manifest,
    head: { appendChild: () => {} },
    getElementById: (id) => nodes.get(id) || null,
  };
  const worker = new FakeEventTarget();
  worker.state = "installing";
  worker.messages = [];
  worker.postMessage = (message) => worker.messages.push(message);
  const registration = new FakeEventTarget();
  registration.active = active;
  registration.installing = worker;
  registration.waiting = null;
  registration.update = async () => {
    registration.dispatch("updatefound");
    worker.state = "installed";
    worker.dispatch("statechange");
  };
  const serviceWorker = new FakeEventTarget();
  serviceWorker.register = async () => registration;
  const navigatorRef = { serviceWorker };
  const locationRef = {
    hostname: "financial-computer.web.app",
    reloads: 0,
    reload() { this.reloads += 1; },
  };
  return { banner, doc, locationRef, manifest, navigatorRef, registration, serviceWorker, updateLater, updateNow, worker };
}

test("PWA update waits for an explicit user action and reloads only once after controller change", async () => {
  const harness = createHarness();
  await setupPWA(harness.doc, {
    navigatorRef: harness.navigatorRef,
    locationRef: harness.locationRef,
    cachesRef: null,
  });

  assert.equal(harness.banner.classList.contains("d-none"), false);
  assert.equal(harness.locationRef.reloads, 0);
  harness.serviceWorker.dispatch("controllerchange");
  assert.equal(harness.locationRef.reloads, 0);

  harness.updateNow.click();
  assert.deepEqual(harness.worker.messages, [{ type: "FINANCE_SKIP_WAITING" }]);
  assert.equal(harness.updateNow.disabled, true);
  harness.serviceWorker.dispatch("controllerchange");
  harness.serviceWorker.dispatch("controllerchange");
  assert.equal(harness.locationRef.reloads, 1);
});

test("first installation stays quiet and later can dismiss a pending update", async () => {
  const firstInstall = createHarness({ active: null });
  await setupPWA(firstInstall.doc, {
    navigatorRef: firstInstall.navigatorRef,
    locationRef: firstInstall.locationRef,
    cachesRef: null,
  });
  assert.equal(firstInstall.banner.classList.contains("d-none"), true);

  const pending = createHarness();
  pending.registration.waiting = pending.worker;
  await setupPWA(pending.doc, {
    navigatorRef: pending.navigatorRef,
    locationRef: pending.locationRef,
    cachesRef: null,
  });
  assert.equal(pending.banner.classList.contains("d-none"), false);
  pending.updateLater.click();
  assert.equal(pending.banner.classList.contains("d-none"), true);
});
