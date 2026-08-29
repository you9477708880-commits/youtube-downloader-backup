import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const PROJECT_ID = "demo-finance-web";
const APP_ID = "financial-computer";
const baseUrl = `http://127.0.0.1:5001/${PROJECT_ID}/asia-east1/adminApi`;
const authBaseUrl = "http://127.0.0.1:9099";
const ADMIN_EMAIL = "admin@example.test";
const PASSWORD = "test-password-123";

let testEnv;
let adminUid = "";
let adminToken = "";
let nonAdminToken = "";

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function clearAuth() {
  const response = await fetch(`${authBaseUrl}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE",
  });
  assert.equal(response.ok, true, `Auth emulator cleanup failed: ${response.status}`);
}

async function signUp(email) {
  const { response, payload } = await jsonRequest(
    `${authBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  assert.equal(response.status, 200, JSON.stringify(payload));
  return { uid: payload.localId, token: payload.idToken, email };
}

async function signIn(email) {
  return jsonRequest(
    `${authBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
}

async function markEmailVerified(uid) {
  const { response, payload } = await jsonRequest(
    `${authBaseUrl}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    {
      method: "POST",
      headers: { Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: uid, emailVerified: true }),
    },
  );
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.emailVerified, true);
}

async function callApi(path, { token = adminToken, method = "GET" } = {}) {
  return jsonRequest(`${baseUrl}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const userRootPath = (uid) => `artifacts/${APP_ID}/users/${uid}`;
const legacyPath = (uid) => `${userRootPath(uid)}/data/finance_v6`;
const metaPath = (uid) => `${userRootPath(uid)}/sync/finance_v7`;
const recordPath = (uid, key) => `${metaPath(uid)}/records/${key}`;

async function seedDocuments(entries) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, value]) => setDoc(doc(context.firestore(), path), value)));
  });
}

async function exists(path) {
  let found = false;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    found = (await getDoc(doc(context.firestore(), path))).exists();
  });
  return found;
}

function legacyFinance({ transactions = 0, wishes = 0, accounts = 0, categoryBudgets = 0 } = {}) {
  return {
    txs: Array.from({ length: transactions }, (_, index) => ({ id: `legacy-tx-${index}` })),
    wishes: Array.from({ length: wishes }, (_, index) => ({ id: `legacy-wish-${index}` })),
    accounts: Array.from({ length: accounts }, (_, index) => ({ id: `legacy-account-${index}` })),
    bsI: [{ id: "legacy-bs" }],
    sinkingFunds: [{ id: "legacy-fund", events: [{ id: "legacy-event" }] }],
    settings: {
      catBud: Object.fromEntries(
        Array.from({ length: categoryBudgets }, (_, index) => [`category-${index}`, 100]),
      ),
    },
  };
}

function v7Record(kind, recordId, payload, { deleted = false } = {}) {
  return {
    kind,
    recordId,
    payload: deleted ? null : payload,
    position: 0,
    revision: deleted ? 2 : 1,
    updatedBy: "emulator-test",
    updatedAt: new Date().toISOString(),
    deleted,
    deletedAt: deleted ? new Date().toISOString() : null,
    migrationId: "",
    syncSchemaVersion: 1,
  };
}

before(async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:8080$/);
  assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^127\.0\.0\.1:9099$/);

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: 8080 },
  });
  await testEnv.clearFirestore();
  await clearAuth();

  const admin = await signUp(ADMIN_EMAIL);
  const nonAdmin = await signUp("member@example.test");
  adminUid = admin.uid;
  adminToken = admin.token;
  nonAdminToken = nonAdmin.token;
});

after(async () => {
  await testEnv?.clearFirestore();
  await testEnv?.cleanup();
  await clearAuth();
});

test("direct Functions emulator endpoint handles OPTIONS", async () => {
  const response = await fetch(`${baseUrl}/api/admin/profile`, { method: "OPTIONS" });
  assert.equal(response.status, 204);
});

test("Functions emulator rejects missing, invalid, and non-admin tokens", async () => {
  const missing = await callApi("/api/admin/profile", { token: "" });
  assert.equal(missing.response.status, 401);
  assert.deepEqual(missing.payload, { error: "missing-token" });

  const invalid = await callApi("/api/admin/profile", { token: "not-a-token" });
  assert.equal(invalid.response.status, 401);
  assert.deepEqual(invalid.payload, { error: "invalid-token" });

  const forbidden = await callApi("/api/admin/profile", { token: nonAdminToken });
  assert.equal(forbidden.response.status, 403);
  assert.deepEqual(forbidden.payload, { error: "forbidden" });
});

test("allowlisted email must be verified before it can access the admin profile", async () => {
  const unverified = await callApi("/api/profile");
  assert.equal(unverified.response.status, 403);
  assert.deepEqual(unverified.payload, { error: "forbidden" });

  await markEmailVerified(adminUid);
  const login = await signIn(ADMIN_EMAIL);
  assert.equal(login.response.status, 200, JSON.stringify(login.payload));
  adminToken = login.payload.idToken;

  const { response, payload } = await callApi("/api/profile");
  assert.equal(response.status, 200);
  assert.equal(payload.email, ADMIN_EMAIL);
  assert.equal(payload.isAdmin, true);
});

test("current admin cannot delete their own Auth account or full user tree", async () => {
  await seedDocuments([
    [legacyPath(adminUid), legacyFinance({ transactions: 1 })],
    [metaPath(adminUid), { status: "active", recordCount: 1 }],
    [recordPath(adminUid, "tx-1"), v7Record("transaction", "tx-1", { id: "tx-1" })],
  ]);

  const account = await callApi(`/users/${adminUid}/account`, { method: "DELETE" });
  assert.equal(account.response.status, 403);
  assert.deepEqual(account.payload, { error: "cannot-delete-current-admin" });

  const full = await callApi(`/users/${adminUid}/full`, { method: "DELETE" });
  assert.equal(full.response.status, 403);
  assert.deepEqual(full.payload, { error: "cannot-delete-current-admin" });

  assert.equal(await exists(legacyPath(adminUid)), true);
  assert.equal(await exists(metaPath(adminUid)), true);
  assert.equal(await exists(recordPath(adminUid, "tx-1")), true);
  const login = await signIn(ADMIN_EMAIL);
  assert.equal(login.response.status, 200, JSON.stringify(login.payload));
});

test("v6-only summary preserves the existing response fields", async () => {
  const target = await signUp("v6-summary@example.test");
  await seedDocuments([[
    legacyPath(target.uid),
    legacyFinance({ transactions: 3, wishes: 2, accounts: 4, categoryBudgets: 2 }),
  ]]);

  const { response, payload } = await callApi(`/users/${target.uid}/summary`);
  assert.equal(response.status, 200);
  assert.equal(payload.hasFinanceDoc, true);
  assert.equal(payload.counts.transactions, 3);
  assert.equal(payload.counts.wishes, 2);
  assert.equal(payload.counts.accounts, 4);
  assert.equal(payload.counts.categoryBudgets, 2);
  assert.equal(payload.counts.balanceSheetItems, 1);
  assert.equal(payload.counts.sinkingFunds, 1);
  assert.equal(payload.counts.fundEvents, 1);
  assert.equal(payload.storage.authoritativeSource, "v6");
  assert.equal(payload.storage.hasLegacyFinanceDoc, true);
  assert.equal(payload.storage.hasV7Meta, false);
  assert.ok(payload.approxBytes > 0);
  assert.ok(payload.lastUpdatedAt);
});

test("active v7 summary takes precedence over legacy and excludes tombstones", async () => {
  const target = await signUp("v7-summary@example.test");
  await seedDocuments([
    [legacyPath(target.uid), legacyFinance({ transactions: 9, wishes: 9, accounts: 9, categoryBudgets: 9 })],
    [metaPath(target.uid), { status: "active", recordCount: 6 }],
    [recordPath(target.uid, "tx-1"), v7Record("transaction", "tx-1", { id: "tx-1" })],
    [recordPath(target.uid, "tx-2"), v7Record("transaction", "tx-2", { id: "tx-2" })],
    [recordPath(target.uid, "tx-deleted"), v7Record("transaction", "tx-deleted", null, { deleted: true })],
    [recordPath(target.uid, "wish-1"), v7Record("wish", "wish-1", { id: "wish-1" })],
    [recordPath(target.uid, "account-1"), v7Record("account", "account-1", { id: "account-1" })],
    [recordPath(target.uid, "settings"), v7Record("settings", "root", { catBud: { food: 100, travel: 200 } })],
  ]);

  const { response, payload } = await callApi(`/users/${target.uid}/summary`);
  assert.equal(response.status, 200);
  assert.equal(payload.storage.authoritativeSource, "v7");
  assert.equal(payload.storage.v7Status, "active");
  assert.equal(payload.storage.v7RecordCount, 6);
  assert.equal(payload.storage.v7ActiveCount, 5);
  assert.equal(payload.storage.v7TombstoneCount, 1);
  assert.equal(payload.counts.transactions, 2);
  assert.equal(payload.counts.wishes, 1);
  assert.equal(payload.counts.accounts, 1);
  assert.equal(payload.counts.categoryBudgets, 2);
  assert.ok(payload.storage.legacyApproxBytes > 0);
  assert.ok(payload.storage.v7ApproxBytes > 0);
});

test("preparing v7 summary keeps complete v6 data authoritative", async () => {
  const target = await signUp("preparing-summary@example.test");
  await seedDocuments([
    [legacyPath(target.uid), legacyFinance({ transactions: 4 })],
    [metaPath(target.uid), { status: "preparing", recordCount: 1 }],
    [recordPath(target.uid, "tx-1"), v7Record("transaction", "tx-1", { id: "tx-1" })],
  ]);

  const { response, payload } = await callApi(`/users/${target.uid}/summary`);
  assert.equal(response.status, 200);
  assert.equal(payload.storage.authoritativeSource, "v6");
  assert.equal(payload.storage.v7Status, "preparing");
  assert.equal(payload.storage.v7RecordCount, 1);
  assert.equal(payload.counts.transactions, 4);
});

test("unauthorized delete request cannot change Firestore data", async () => {
  const target = await signUp("denied-delete@example.test");
  await seedDocuments([[legacyPath(target.uid), legacyFinance({ transactions: 1 })]]);

  const denied = await callApi(`/users/${target.uid}/data`, { token: nonAdminToken, method: "DELETE" });
  assert.equal(denied.response.status, 403);
  assert.equal(await exists(legacyPath(target.uid)), true);
});

test("data delete recursively removes v6, v7, and nested user data but keeps Auth and other users", async () => {
  const target = await signUp("delete-data@example.test");
  const untouched = await signUp("untouched@example.test");
  const futureNestedPath = `${userRootPath(target.uid)}/future/container/items/item-1`;
  await seedDocuments([
    [legacyPath(target.uid), legacyFinance({ transactions: 1 })],
    [metaPath(target.uid), { status: "active", recordCount: 1 }],
    [recordPath(target.uid, "tx-1"), v7Record("transaction", "tx-1", { id: "tx-1" })],
    [futureNestedPath, { value: "future-data" }],
    [legacyPath(untouched.uid), legacyFinance({ transactions: 2 })],
  ]);

  const { response, payload } = await callApi(`/users/${target.uid}/data`, { method: "DELETE" });
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, mode: "data", authRetained: true });
  assert.equal(await exists(legacyPath(target.uid)), false);
  assert.equal(await exists(metaPath(target.uid)), false);
  assert.equal(await exists(recordPath(target.uid, "tx-1")), false);
  assert.equal(await exists(futureNestedPath), false);
  assert.equal(await exists(legacyPath(untouched.uid)), true);

  const login = await signIn(target.email);
  assert.equal(login.response.status, 200, JSON.stringify(login.payload));
});

test("account-only delete is idempotent and explicitly retains Firestore data", async () => {
  const target = await signUp("delete-account@example.test");
  await seedDocuments([[legacyPath(target.uid), legacyFinance({ transactions: 1 })]]);

  const first = await callApi(`/users/${target.uid}/account`, { method: "DELETE" });
  assert.equal(first.response.status, 200);
  assert.deepEqual(first.payload, { ok: true, mode: "account", dataRetained: true });
  assert.equal(await exists(legacyPath(target.uid)), true);

  const second = await callApi(`/users/${target.uid}/account`, { method: "DELETE" });
  assert.equal(second.response.status, 200);
  assert.deepEqual(second.payload, { ok: true, mode: "account", dataRetained: true });
});

test("full delete removes both Auth and the recursive Firestore user tree", async () => {
  const target = await signUp("delete-full@example.test");
  await seedDocuments([
    [legacyPath(target.uid), legacyFinance({ transactions: 1 })],
    [metaPath(target.uid), { status: "active", recordCount: 1 }],
    [recordPath(target.uid, "tx-1"), v7Record("transaction", "tx-1", { id: "tx-1" })],
  ]);

  const { response, payload } = await callApi(`/users/${target.uid}/full`, { method: "DELETE" });
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, mode: "full", dataRetained: false });
  assert.equal(await exists(legacyPath(target.uid)), false);
  assert.equal(await exists(metaPath(target.uid)), false);
  assert.equal(await exists(recordPath(target.uid, "tx-1")), false);

  const login = await signIn(target.email);
  assert.equal(login.response.status, 400);
});
