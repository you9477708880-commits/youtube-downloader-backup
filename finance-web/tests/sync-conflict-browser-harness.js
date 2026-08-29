import { createSyncCoordinator } from "../src/app/sync-coordinator.js";
import { createConflictRecoveryStore, createRecoveryPreserver } from "../src/services/conflict-recovery.js";
import { createRecordCloudSync } from "../src/services/storage-cloud-records.js";
import {
  loadLocalState,
  saveLocalState,
  userStorageScope,
} from "../src/services/storage-local.js";
import {
  areFinanceStatesEquivalent,
  buildCloudConflictMessage,
  hasMeaningfulFinanceData,
} from "../src/services/sync-policy.js";
import { cloneState, createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";
import { normalizeFinanceStateMoney } from "../src/utils/normalize-state.js";

const PROJECT_ID = "demo-finance-web";
const APP_ID = "financial-computer-sync-e2e";
const PASSWORD = "browser-sync-test-123";
const result = document.getElementById("sync-e2e-result");
const params = new URLSearchParams(location.search);
const role = params.get("role") || "";
const uid = params.get("uid") || "";
const email = params.get("email") || "";

function report(status, details) {
  result.dataset.status = status;
  result.textContent = `${status.toUpperCase()} ${role}: ${details}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitFor(predicate, label, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const value = await predicate();
        if (value) {
          resolve(value);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`timeout:${label}`));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

function financeState(note) {
  const state = createInitialState();
  state.txs = [{
    id: "sync-e2e-transaction",
    type: "expense",
    amount: 100,
    date: "2026-08-29",
    desc: note,
    note,
    cat: "其他支出",
    category: "其他支出",
    subcategory: "未分類",
    acc: "a1",
    accountId: "a1",
  }];
  return normalizeFinanceStateMoney(state);
}

async function createFirebaseModules() {
  const [appMod, authMod, firestoreMod] = await Promise.all([
    import("/vendor/firebase-app.js"),
    import("/vendor/firebase-auth.js"),
    import("/vendor/firebase-firestore.js"),
  ]);
  const app = appMod.initializeApp({ projectId: PROJECT_ID, apiKey: "fake-api-key" }, `sync-e2e-${role}`);
  const auth = authMod.getAuth(app);
  authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  await authMod.signInWithEmailAndPassword(auth, email, PASSWORD);
  const db = firestoreMod.initializeFirestore(app, {
    localCache: firestoreMod.memoryLocalCache(),
  });
  firestoreMod.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  return {
    app: { ...appMod, initializeApp: () => app },
    auth: { ...authMod, getAuth: () => auth },
    firestore: { ...firestoreMod, initializeFirestore: () => db },
    db,
    firestoreMod,
  };
}

async function run() {
  if (!role || !uid || !email) throw new Error("missing-harness-parameters");
  Object.defineProperty(globalThis, "__finance_runtime", {
    value: Object.freeze({ mode: "production", cloudEnabled: true, pwaEnabled: false }),
    configurable: true,
  });
  globalThis.__firebase_config = JSON.stringify({ projectId: PROJECT_ID, apiKey: "fake-api-key" });
  globalThis.__app_id = APP_ID;

  const localState = financeState(role === "conflict" ? "browser-local-different" : "cloud-seed");
  const scope = userStorageScope(uid);
  saveLocalState(localState, scope);

  const store = createStore(createInitialState());
  const recoveryStore = createConflictRecoveryStore();
  let coordinator = null;
  let cloudSync = null;
  let promptCount = 0;
  let emergencyDownloads = 0;
  let initialResult = "";
  const statuses = [];
  const warnings = [];

  const preserveRollback = createRecoveryPreserver({
    recoveryStore,
    getScope: () => coordinator?.getLocalScope(),
    exportEmergency: () => { emergencyDownloads += 1; },
    onWarn: (message, error) => warnings.push(`${message}:${error?.message || error}`),
  });
  coordinator = createSyncCoordinator({
    store,
    createBaseState: createInitialState,
    cloneState,
    localScopeDefault: "local",
    userStorageScope,
    loadLocalState,
    saveLocalState,
    normalizeState: normalizeFinanceStateMoney,
    hasMeaningfulData: hasMeaningfulFinanceData,
    areStatesEquivalent: areFinanceStatesEquivalent,
    buildConflictMessage: buildCloudConflictMessage,
    promptSyncChoice: () => {
      promptCount += 1;
      return role === "conflict" ? "cloud" : "cancel";
    },
    confirmUnboundImport: () => false,
    preserveRollback,
    refreshStateUi: () => {},
    onStatus: (status) => statuses.push(status),
    onWarn: (message, error) => warnings.push(`${message}:${error?.message || error}`),
  });
  coordinator.bindWholeStateReplacer((state) => store.replace(state));

  const modules = await createFirebaseModules();
  cloudSync = await createRecordCloudSync({
    firebaseModules: modules,
    getState: () => store.getState(),
    onStatus: (status) => statuses.push(status),
    onUserChange: (user) => coordinator.onUserChange(user),
    onConflict: (conflict) => coordinator.onConflict(conflict),
    onRemoteState: async (state, metadata) => {
      initialResult = await coordinator.onRemoteState(state, metadata);
    },
  });
  coordinator.attachCloudSync(cloudSync);

  await waitFor(() => initialResult, "initial-remote-state");
  const metaRef = modules.firestoreMod.doc(
    modules.db,
    "artifacts",
    APP_ID,
    "users",
    uid,
    "sync",
    "finance_v7",
  );
  const recordsRef = modules.firestoreMod.collection(metaRef, "records");

  if (role === "seed") {
    await coordinator.enqueueCloudState();
    await waitFor(async () => {
      const [meta, records] = await Promise.all([
        modules.firestoreMod.getDoc(metaRef),
        modules.firestoreMod.getDocs(recordsRef),
      ]);
      return meta.data()?.status === "active" && records.size > 0;
    }, "cloud-seed-active");
    assert(promptCount === 0, "seed-must-not-prompt");
    assert(emergencyDownloads === 0, "seed-must-not-download-json");
    report("pass", "cloud seeded without conflict or JSON download");
    cloudSync.destroy();
    return;
  }

  if (role === "equal") {
    await waitFor(() => statuses.includes("online"), "equal-online");
    assert(initialResult === "applied-equivalent-or-empty", `unexpected-equal-result:${initialResult}`);
    assert(promptCount === 0, "equivalent-state-must-not-prompt");
    assert((await recoveryStore.list(scope)).length === 0, "equivalent-state-must-not-create-recovery");
    assert(emergencyDownloads === 0, "equivalent-state-must-not-download-json");
    report("pass", "equivalent local/cloud data produced no prompt, recovery, or JSON");
    cloudSync.destroy();
    return;
  }

  if (role === "conflict") {
    const entries = await waitFor(async () => {
      const list = await recoveryStore.list(scope);
      return list.length ? list : null;
    }, "conflict-recovery-entry");
    assert(initialResult === "applied-cloud", `unexpected-conflict-result:${initialResult}`);
    assert(promptCount === 1, `conflict-prompt-count:${promptCount}`);
    assert(store.getState().txs[0]?.note === "cloud-seed", "cloud-choice-not-applied");
    assert(entries[0].state.txs[0]?.note === "browser-local-different", "losing-version-not-recovered");
    assert(entries[0].choice === "cloud", "recovery-choice-not-recorded");
    assert(emergencyDownloads === 0, "successful-indexeddb-recovery-must-not-download-json");
    report("pass", "real difference prompted once, kept cloud, and stored losing local version without JSON");
    cloudSync.destroy();
    return;
  }

  throw new Error(`unknown-role:${role}`);
}

run().catch((error) => {
  console.error(error);
  report("fail", `${error.message}${error.stack ? ` | ${error.stack}` : ""}`);
});
