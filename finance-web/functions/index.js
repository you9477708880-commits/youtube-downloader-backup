const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const REGION = "asia-east1";
const APP_ID = process.env.APP_ID || "financial-computer";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

function json(res, status, payload) {
  res.status(status).set("Content-Type", "application/json; charset=utf-8").send(payload);
}

function normalizePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "api") return parts.slice(1);
  return parts;
}

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    const error = new Error("missing-token");
    error.status = 401;
    throw error;
  }

  const token = authHeader.slice("Bearer ".length);
  const decoded = await getAuth().verifyIdToken(token);
  const email = String(decoded.email || "").toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) {
    const error = new Error("forbidden");
    error.status = 403;
    throw error;
  }
  return decoded;
}

async function listUsersPage() {
  const auth = getAuth();
  const users = [];
  let nextPageToken;

  do {
    const page = await auth.listUsers(100, nextPageToken);
    users.push(...page.users);
    nextPageToken = page.pageToken;
  } while (nextPageToken && users.length < 300);

  return users.map((user) => ({
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    disabled: Boolean(user.disabled),
    isAnonymous: user.providerData.length === 0,
    providers: user.providerData.map((provider) => provider.providerId),
    createdAt: user.metadata.creationTime || "",
    lastSignInAt: user.metadata.lastSignInTime || "",
  }));
}

function buildFinanceDocRef(uid) {
  return getFirestore().doc(`artifacts/${APP_ID}/users/${uid}/data/finance_v6`);
}

async function getUserSummary(uid) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const financeSnap = await buildFinanceDocRef(uid).get();
  const finance = financeSnap.exists ? financeSnap.data() : null;

  return {
    user: {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      disabled: Boolean(user.disabled),
      createdAt: user.metadata.creationTime || "",
      lastSignInAt: user.metadata.lastSignInTime || "",
    },
    hasFinanceDoc: financeSnap.exists,
    lastUpdatedAt: financeSnap.exists ? financeSnap.updateTime.toDate().toISOString() : "",
    approxBytes: finance ? JSON.stringify(finance).length : 0,
    counts: {
      transactions: Array.isArray(finance?.txs) ? finance.txs.length : 0,
      wishes: Array.isArray(finance?.wishes) ? finance.wishes.length : 0,
      accounts: Array.isArray(finance?.accounts) ? finance.accounts.length : 0,
      categoryBudgets: finance?.settings?.catBud ? Object.keys(finance.settings.catBud).length : 0,
    },
  };
}

async function deleteUserData(uid) {
  await buildFinanceDocRef(uid).delete().catch(() => {});
  return { ok: true, mode: "data" };
}

async function deleteUserAccount(uid) {
  await getAuth().deleteUser(uid);
  return { ok: true, mode: "account" };
}

exports.adminApi = onRequest({ region: REGION, cors: false }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const admin = await requireAdmin(req);
    const parts = normalizePath(new URL(req.url, `https://${req.headers.host}`).pathname);

    if (req.method === "GET" && parts.length === 2 && parts[0] === "admin" && parts[1] === "profile") {
      json(res, 200, {
        uid: admin.uid,
        email: admin.email || "",
        displayName: admin.name || "",
        role: "owner",
        isAdmin: true,
      });
      return;
    }

    if (req.method === "GET" && parts.length === 1 && parts[0] === "users") {
      json(res, 200, { users: await listUsersPage() });
      return;
    }

    if (req.method === "GET" && parts.length === 3 && parts[0] === "users" && parts[2] === "summary") {
      json(res, 200, await getUserSummary(parts[1]));
      return;
    }

    if (req.method === "DELETE" && parts.length === 3 && parts[0] === "users" && parts[2] === "data") {
      json(res, 200, await deleteUserData(parts[1]));
      return;
    }

    if (req.method === "DELETE" && parts.length === 3 && parts[0] === "users" && parts[2] === "account") {
      json(res, 200, await deleteUserAccount(parts[1]));
      return;
    }

    if (req.method === "DELETE" && parts.length === 3 && parts[0] === "users" && parts[2] === "full") {
      await deleteUserData(parts[1]);
      await deleteUserAccount(parts[1]);
      json(res, 200, { ok: true, mode: "full" });
      return;
    }

    json(res, 404, { error: "not-found" });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || "internal-error";
    json(res, status, { error: message });
  }
});
