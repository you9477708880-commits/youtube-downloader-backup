import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeviceDataController } from "../src/app/controllers/device-data-controller.js";

function element() {
  const classes = new Set(["d-none"]);
  return {
    textContent: "",
    hidden: false,
    checked: false,
    disabled: false,
    classList: {
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name),
    },
  };
}

function createElements() {
  return {
    modal: element(), title: element(), summary: element(), notice: element(),
    unsyncedWrap: element(), unsyncedAck: element(), confirm: element(),
    cancel: element(), backup: element(),
  };
}

test("device clear controller requires two explicit steps and blocks unacknowledged pending work", async () => {
  const elements = createElements();
  const calls = [];
  const messages = [];
  const service = {
    inspect: async () => ({
      uid: "u1", hasSnapshot: true, hasRollback: false, hasOutbox: true, recoveryCount: 2,
      cloudStatus: { hasPendingOutbox: true },
    }),
    clear: async (_target, options) => { calls.push(options); return { ok: true }; },
  };
  let reloads = 0;
  const controller = createDeviceDataController({
    elements,
    createService: () => service,
    getTarget: () => ({ scope: "uid:u1", uid: "u1" }),
    toast: { show: (message) => messages.push(message) },
    reload: () => { reloads += 1; },
  });

  assert.equal(await controller.open(), true);
  assert.equal(elements.modal.classList.contains("d-none"), false);
  assert.equal(elements.unsyncedWrap.hidden, false);
  assert.equal(await controller.confirm(), false);
  assert.equal(calls.length, 0);
  elements.unsyncedAck.checked = true;
  assert.equal(await controller.confirm(), true);
  assert.equal(elements.confirm.textContent, "確認清除此裝置");
  assert.equal(calls.length, 0);
  assert.equal(await controller.confirm(), true);
  assert.deepEqual(calls, [{ acknowledgeUnsynced: true }]);
  assert.equal(reloads, 1);
  assert.ok(messages.some((message) => message.includes("尚未同步")));
});

test("device clear controller exports backup without clearing and keeps modal on fail-closed result", async () => {
  const elements = createElements();
  let backups = 0;
  let clears = 0;
  let reloads = 0;
  const controller = createDeviceDataController({
    elements,
    createService: () => ({
      inspect: async () => ({
        uid: "", hasSnapshot: true, hasRollback: true, hasOutbox: false, recoveryCount: 0,
        cloudStatus: {},
      }),
      clear: async () => {
        clears += 1;
        return { ok: false, code: "recovery-clear-failed", requiresReload: false };
      },
    }),
    getTarget: () => ({ scope: "local" }),
    exportBackup: () => { backups += 1; },
    toast: { show: () => {} },
    reload: () => { reloads += 1; },
  });

  await controller.open();
  assert.equal(controller.backup(), true);
  assert.equal(backups, 1);
  assert.equal(clears, 0);
  await controller.confirm();
  assert.equal(await controller.confirm(), false);
  assert.equal(clears, 1);
  assert.equal(reloads, 0);
  assert.equal(elements.modal.classList.contains("d-none"), false);
});
