import assert from "node:assert/strict";
import { createSyncCoordinator } from "../src/app/sync-coordinator.js";

function state(marker = "") {
  return {
    schemaVersion: 2,
    txs: marker ? [{ id: marker, amount: 1 }] : [],
    bsI: [],
    wishes: [],
    sinkingFunds: [],
    accounts: [],
    userCats: { income: [], expense: [] },
    settings: { marker },
  };
}

function clone(value) {
  return structuredClone(value);
}

function createFixture({ choices = [], confirmations = [], rollback = true } = {}) {
  let current = state();
  const local = new Map();
  const saves = [];
  const replacements = [];
  const refreshes = [];
  const statuses = [];
  const notifications = [];
  const authViews = [];
  const rollbackCalls = [];
  const promptRequests = [];
  const scheduled = [];
  const cloudCalls = { save: 0, resolve: [], signIn: 0, signOut: 0 };
  const store = {
    getState: () => current,
    replace(next) {
      current = clone(next);
      replacements.push(clone(next));
    },
  };
  const coordinator = createSyncCoordinator({
    store,
    createBaseState: () => state(),
    cloneState: clone,
    localScopeDefault: "local",
    userStorageScope: (uid) => `uid:${uid}`,
    loadLocalState: (base, scope) => clone(local.get(scope) || base),
    saveLocalState: (next, scope) => {
      local.set(scope, clone(next));
      saves.push({ scope, state: clone(next) });
    },
    normalizeState: (next) => ({ ...clone(next), normalized: true }),
    hasMeaningfulData: (next) => Boolean(next?.txs?.length),
    areStatesEquivalent: (left, right) => JSON.stringify(left?.txs || []) === JSON.stringify(right?.txs || []),
    buildConflictMessage: (user) => `conflict:${user?.uid || "none"}`,
    promptSyncChoice: (request) => {
      promptRequests.push(clone(request));
      return choices.shift() || "cancel";
    },
    confirmUnboundImport: () => confirmations.shift() || false,
    preserveRollback: (next, label, metadata) => {
      rollbackCalls.push({ state: clone(next), label, metadata: clone(metadata || {}) });
      return typeof rollback === "function" ? rollback(label) : rollback;
    },
    schedule: (callback) => scheduled.push(callback),
    refreshStateUi: (next) => refreshes.push(clone(next)),
    onStatus: (value) => statuses.push(value),
    onNotify: (...args) => notifications.push(args),
    onAuthViewChange: (value) => authViews.push(value),
  });
  const cloud = {
    enabled: true,
    error: "",
    save: async () => { cloudCalls.save += 1; },
    resolveConflict: async (choice) => { cloudCalls.resolve.push(choice); return true; },
    signInWithGoogle: async () => { cloudCalls.signIn += 1; },
    signOutToAnonymous: async () => { cloudCalls.signOut += 1; return { mode: "anonymous" }; },
  };

  async function flushScheduled() {
    while (scheduled.length) {
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
  }

  return {
    coordinator,
    cloud,
    cloudCalls,
    local,
    saves,
    replacements,
    refreshes,
    statuses,
    notifications,
    authViews,
    rollbackCalls,
    promptRequests,
    scheduled,
    flushScheduled,
    setState(next) { current = clone(next); },
    getState() { return current; },
    bind() { coordinator.bindWholeStateReplacer((next) => store.replace(next)); },
  };
}

{
  const fx = createFixture();
  fx.coordinator.attachCloudSync(fx.cloud);
  assert.throws(() => fx.coordinator.onUserChange({ uid: "a", isAnonymous: false }), /replacer-not-bound/);
  await assert.rejects(fx.coordinator.onRemoteState(state("remote"), { initial: true }), /replacer-not-bound/);
}

{
  const fx = createFixture();
  fx.bind();
  fx.coordinator.ensureLocalScopeIfDisabled();
  fx.setState(state("local-data"));
  assert.equal(fx.coordinator.getLocalScope(), "local");
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  assert.equal(fx.saves.at(-1).scope, "local");
  assert.equal(fx.coordinator.getLocalScope(), "uid:a");
  assert.equal(fx.coordinator.getPendingUnboundLocalState().txs[0].id, "local-data");
  assert.deepEqual(fx.getState().txs, []);

  fx.local.set("uid:b", state("b-local"));
  fx.coordinator.onUserChange({ uid: "b", isAnonymous: false });
  assert.equal(fx.saves.at(-1).scope, "uid:a");
  assert.equal(fx.getState().txs[0].id, "b-local");
  assert.equal(fx.coordinator.getLocalScope(), "uid:b");
  fx.coordinator.onUserChange({ isAnonymous: true });
  assert.equal(fx.coordinator.getLocalScope(), "local");
  assert.equal(fx.coordinator.getPendingUnboundLocalState(), null);
}

{
  const fx = createFixture({ confirmations: [true] });
  fx.bind();
  fx.coordinator.ensureLocalScopeIfDisabled();
  fx.setState(state("unbound"));
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  const result = await fx.coordinator.onRemoteState(state(), { source: "records", initial: true });
  assert.equal(result, "imported-unbound-local");
  assert.equal(fx.getState().txs[0].id, "unbound");
  assert.equal(fx.saves.at(-1).scope, "uid:a");
  await fx.flushScheduled();
  assert.equal(fx.cloudCalls.save, 1);
}

{
  const fx = createFixture();
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));
  assert.equal(await fx.coordinator.onRemoteState(state(), { source: "records", initial: true }), "kept-local");
  await fx.flushScheduled();
  assert.equal(fx.cloudCalls.save, 1);

  const same = state("local");
  assert.equal(await fx.coordinator.onRemoteState(same, { source: "legacy", initial: true, migrationRequired: true }), "applied-equivalent-or-empty");
  assert.equal(fx.promptRequests.length, 0);
  assert.equal(fx.getState().normalized, true);
  await fx.flushScheduled();
  assert.equal(fx.cloudCalls.save, 2);
}

{
  const fx = createFixture({ choices: ["cloud"] });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));
  assert.equal(
    await fx.coordinator.onRemoteState(state("remote"), { source: "records", initial: true, hasPendingOutbox: true }),
    "applied-cloud",
  );
  assert.equal(fx.rollbackCalls[0].label, "before-cloud-overwrite");
  assert.equal(fx.rollbackCalls[0].metadata.choice, "cloud");
  assert.equal(fx.rollbackCalls[0].metadata.conflictType, "initial");
  assert.equal(fx.rollbackCalls[0].metadata.winnerState.txs[0].id, "remote");
  assert.equal(fx.getState().txs[0].id, "remote");
}

{
  const fx = createFixture({ choices: ["cloud"] });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  assert.equal(
    await fx.coordinator.onRemoteState(state("outbox-remote"), {
      source: "records",
      initial: true,
      hasPendingOutbox: true,
    }),
    "applied-cloud",
  );
  assert.equal(fx.getState().txs[0].id, "outbox-remote");
  assert.equal(fx.rollbackCalls.length, 0);
}

{
  const fx = createFixture({ choices: ["local"] });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));
  assert.equal(await fx.coordinator.onRemoteState(state("remote"), { source: "records", initial: true }), "kept-local");
  assert.equal(fx.rollbackCalls[0].label, "before-local-overwrite");
  await fx.flushScheduled();
  assert.equal(fx.cloudCalls.save, 1);
}

{
  const fx = createFixture({ choices: ["cancel"] });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));
  assert.equal(await fx.coordinator.onRemoteState(state("remote"), { source: "records", initial: true }), "cancelled");
  assert.equal(fx.coordinator.getConflictDecision(), "cancel");
  assert.equal(await fx.coordinator.enqueueCloudState(), false);
  assert.equal(await fx.coordinator.onRemoteState(state("later"), { source: "records", initial: false }), "cancelled");
  assert.equal(fx.getState().txs[0].id, "local");
}

{
  let resolveChoice;
  const choice = new Promise((resolve) => { resolveChoice = resolve; });
  const fx = createFixture({ choices: [choice] });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));

  const pendingDecision = fx.coordinator.onRemoteState(state("remote"), { source: "records", initial: true });
  assert.equal(fx.coordinator.getConflictDecision(), "pending");
  assert.equal(await fx.coordinator.enqueueCloudState(), false);
  resolveChoice("local");
  assert.equal(await pendingDecision, "kept-local");
  await fx.flushScheduled();
  assert.equal(fx.cloudCalls.save, 1);
}

{
  const fx = createFixture();
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));
  assert.equal(await fx.coordinator.onRemoteState(state("update"), { source: "records", initial: false }), "applied-record-update");
  assert.equal(fx.getState().txs[0].id, "update");
  assert.equal(await fx.coordinator.onRemoteState(state("resolved"), { source: "conflict-resolution" }), "applied-conflict-resolution");
  assert.equal(fx.getState().txs[0].id, "resolved");
  assert.equal(fx.saves.at(-1).scope, "uid:a");
  assert.ok(fx.refreshes.length >= 2);
}

{
  const fx = createFixture({ choices: ["cloud", "local", "cancel"] });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  assert.equal(await fx.coordinator.onConflict({ localState: state("l"), remoteState: state("r"), keys: ["k"] }), true);
  await fx.flushScheduled();
  assert.equal(fx.rollbackCalls[0].label, "before-cloud-conflict");
  assert.deepEqual(fx.rollbackCalls[0].metadata.recordKeys, ["k"]);
  assert.equal(fx.rollbackCalls[0].metadata.winnerState.txs[0].id, "r");
  assert.deepEqual(fx.cloudCalls.resolve, ["cloud"]);
  assert.equal(await fx.coordinator.onConflict({ localState: state("l"), remoteState: state("r"), keys: ["k"] }), true);
  await fx.flushScheduled();
  assert.equal(fx.rollbackCalls[1].label, "before-local-conflict");
  assert.equal(fx.rollbackCalls[1].metadata.winnerState.txs[0].id, "l");
  assert.deepEqual(fx.cloudCalls.resolve, ["cloud", "local"]);
  await fx.coordinator.onConflict({ localState: state("l"), remoteState: state("r"), keys: ["k"] });
  await fx.flushScheduled();
  assert.equal(fx.coordinator.getConflictDecision(), "cancel");
  assert.deepEqual(fx.cloudCalls.resolve, ["cloud", "local", "cancel"]);
}

{
  const fx = createFixture({ choices: ["cloud"], rollback: false });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  assert.equal(await fx.coordinator.onConflict({ localState: state("l"), remoteState: state("r"), keys: ["k"] }), false);
  await fx.flushScheduled();
  assert.deepEqual(fx.cloudCalls.resolve, []);
}

{
  const fx = createFixture({ choices: ["cloud"], rollback: false });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));
  assert.equal(await fx.coordinator.onRemoteState(state("remote"), { source: "records", initial: true }), "rollback-failed");
  assert.equal(fx.getState().txs[0].id, "local");
  assert.equal(fx.coordinator.getConflictDecision(), "cancel");
}

{
  const fx = createFixture({ choices: ["local"], rollback: false });
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  fx.setState(state("local"));
  assert.equal(await fx.coordinator.onRemoteState(state("remote"), { source: "records", initial: true }), "rollback-failed");
  await fx.flushScheduled();
  assert.equal(fx.getState().txs[0].id, "local");
  assert.equal(fx.cloudCalls.save, 0);
}

{
  const fx = createFixture();
  fx.bind();
  fx.coordinator.attachCloudSync(fx.cloud);
  fx.coordinator.onUserChange({ isAnonymous: true });
  const pending = fx.coordinator.performAuthAction();
  assert.equal(fx.coordinator.getAuthAction(), "signing-in");
  assert.equal(await fx.coordinator.performAuthAction(), false);
  assert.equal(await pending, true);
  assert.equal(fx.cloudCalls.signIn, 1);
  assert.equal(fx.coordinator.getAuthAction(), null);

  fx.coordinator.onUserChange({ uid: "a", isAnonymous: false });
  assert.equal(await fx.coordinator.performAuthAction(), true);
  assert.equal(fx.cloudCalls.signOut, 1);
  assert.ok(fx.authViews.some((view) => view.action === "signing-in"));
  assert.ok(fx.authViews.some((view) => view.action === "signing-out"));
}

{
  const fx = createFixture();
  fx.bind();
  fx.coordinator.attachCloudSync({
    ...fx.cloud,
    signInWithGoogle: async () => { throw new Error("popup-blocked"); },
  });
  fx.coordinator.onUserChange({ isAnonymous: true });
  assert.equal(await fx.coordinator.performAuthAction(), false);
  assert.equal(fx.coordinator.getAuthAction(), null);
  assert.deepEqual(fx.notifications.at(-1), ["google-sign-in-failed", "error"]);
}

console.log("Sync coordinator tests passed");
