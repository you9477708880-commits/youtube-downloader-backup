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

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "api") return parts.slice(1);
  return parts;
}

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw httpError(401, "missing-token");
  }

  const token = authHeader.slice("Bearer ".length);
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch (error) {
    throw httpError(401, "invalid-token");
  }
  const email = String(decoded.email || "").toLowerCase();
  if (decoded.email_verified !== true || !email || !ADMIN_EMAILS.includes(email)) {
    throw httpError(403, "forbidden");
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

function validateUid(uid) {
  if (typeof uid !== "string" || !uid.length || uid.length > 128) {
    throw httpError(400, "invalid-uid");
  }
  return uid;
}

function buildUserRootRef(uid) {
  return getFirestore().doc(`artifacts/${APP_ID}/users/${validateUid(uid)}`);
}

function buildV7MetaRef(uid) {
  return getFirestore().doc(`artifacts/${APP_ID}/users/${validateUid(uid)}/sync/finance_v7`);
}

function approximateBytes(value) {
  if (value == null) return 0;
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function latestUpdateIso(snapshots) {
  const milliseconds = snapshots
    .map((snapshot) => snapshot?.updateTime?.toMillis?.() || 0)
    .filter((value) => value > 0);
  return milliseconds.length ? new Date(Math.max(...milliseconds)).toISOString() : "";
}

function legacyCounts(finance) {
  return {
    transactions: Array.isArray(finance?.txs) ? finance.txs.length : 0,
    wishes: Array.isArray(finance?.wishes) ? finance.wishes.length : 0,
    accounts: Array.isArray(finance?.accounts) ? finance.accounts.length : 0,
    categoryBudgets: finance?.settings?.catBud ? Object.keys(finance.settings.catBud).length : 0,
    balanceSheetItems: Array.isArray(finance?.bsI) ? finance.bsI.length : 0,
    sinkingFunds: Array.isArray(finance?.sinkingFunds) ? finance.sinkingFunds.length : 0,
    lifeRoutines: Array.isArray(finance?.lifeRoutines) ? finance.lifeRoutines.length : 0,
    fundEvents: Array.isArray(finance?.sinkingFunds)
      ? finance.sinkingFunds.reduce(
        (total, fund) => total + (Array.isArray(fund?.events) ? fund.events.length : 0),
        0,
      )
      : 0,
  };
}

function summarizeV7Records(snapshot) {
  const byKind = {};
  let tombstones = 0;
  let settings = null;
  const documents = [];

  snapshot.forEach((document) => {
    documents.push(document);
    const record = document.data();
    if (record?.deleted === true) {
      tombstones += 1;
      return;
    }
    const kind = String(record?.kind || "unknown");
    byKind[kind] = (byKind[kind] || 0) + 1;
    if (kind === "settings" && record?.recordId === "root" && record.payload) {
      settings = record.payload;
    }
  });

  return {
    counts: {
      transactions: byKind.transaction || 0,
      wishes: byKind.wish || 0,
      accounts: byKind.account || 0,
      categoryBudgets: settings?.catBud ? Object.keys(settings.catBud).length : 0,
      balanceSheetItems: byKind.balanceSheetItem || 0,
      sinkingFunds: byKind.sinkingFund || 0,
      fundEvents: byKind.fundEvent || 0,
      lifeRoutines: byKind.lifeRoutine || 0,
    },
    byKind,
    activeCount: snapshot.size - tombstones,
    tombstoneCount: tombstones,
    documents,
  };
}

async function getUserSummary(uid) {
  validateUid(uid);
  const auth = getAuth();
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") throw httpError(404, "user-not-found");
    throw error;
  }

  const legacyRef = buildFinanceDocRef(uid);
  const v7MetaRef = buildV7MetaRef(uid);
  const [financeSnap, v7MetaSnap, v7RecordsSnap] = await Promise.all([
    legacyRef.get(),
    v7MetaRef.get(),
    v7MetaRef.collection("records").get(),
  ]);
  const finance = financeSnap.exists ? financeSnap.data() : null;
  const v7Meta = v7MetaSnap.exists ? v7MetaSnap.data() : null;
  const v7 = summarizeV7Records(v7RecordsSnap);
  const v7Exists = v7MetaSnap.exists || v7RecordsSnap.size > 0;
  const authoritativeSource = v7Meta?.status === "active"
    ? "v7"
    : financeSnap.exists
      ? "v6"
      : v7Exists
        ? "v7-incomplete"
        : "none";
  const counts = authoritativeSource === "v6" ? legacyCounts(finance) : v7.counts;
  const allSnapshots = [financeSnap, v7MetaSnap, ...v7.documents];
  const legacyApproxBytes = approximateBytes(finance);
  const v7ApproxBytes = approximateBytes(v7Meta)
    + v7.documents.reduce((total, document) => total + approximateBytes(document.data()), 0);

  return {
    user: {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      disabled: Boolean(user.disabled),
      createdAt: user.metadata.creationTime || "",
      lastSignInAt: user.metadata.lastSignInTime || "",
    },
    hasFinanceDoc: authoritativeSource !== "none",
    lastUpdatedAt: latestUpdateIso(allSnapshots),
    approxBytes: legacyApproxBytes + v7ApproxBytes,
    counts,
    storage: {
      authoritativeSource,
      hasLegacyFinanceDoc: financeSnap.exists,
      hasV7Meta: v7MetaSnap.exists,
      v7Status: String(v7Meta?.status || ""),
      v7RecordCount: v7RecordsSnap.size,
      v7ActiveCount: v7.activeCount,
      v7TombstoneCount: v7.tombstoneCount,
      v7ByKind: v7.byKind,
      legacyApproxBytes,
      v7ApproxBytes,
    },
  };
}

async function deleteUserData(uid) {
  const userRoot = buildUserRootRef(uid);
  await getFirestore().recursiveDelete(userRoot);
  return { ok: true, mode: "data", authRetained: true };
}

async function deleteUserAccount(uid) {
  validateUid(uid);
  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  return { ok: true, mode: "account", dataRetained: true };
}

function preventCurrentAdminAccountDeletion(admin, uid) {
  const targetUid = validateUid(uid);
  if (targetUid === admin.uid) {
    throw httpError(403, "cannot-delete-current-admin");
  }
  return targetUid;
}

exports.adminApi = onRequest({ region: REGION, cors: false }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const admin = await requireAdmin(req);
    const parts = normalizePath(new URL(req.url, `https://${req.headers.host}`).pathname);

    const isProfileRoute = (parts.length === 1 && parts[0] === "profile")
      || (parts.length === 2 && parts[0] === "admin" && parts[1] === "profile");
    if (req.method === "GET" && isProfileRoute) {
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
      const targetUid = preventCurrentAdminAccountDeletion(admin, parts[1]);
      json(res, 200, await deleteUserAccount(targetUid));
      return;
    }

    if (req.method === "DELETE" && parts.length === 3 && parts[0] === "users" && parts[2] === "full") {
      const targetUid = preventCurrentAdminAccountDeletion(admin, parts[1]);
      await deleteUserData(targetUid);
      await deleteUserAccount(targetUid);
      json(res, 200, { ok: true, mode: "full", dataRetained: false });
      return;
    }

    json(res, 404, { error: "not-found" });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("adminApi failed", error);
    const message = status >= 500 ? "internal-error" : error.message || "internal-error";
    json(res, status, { error: message });
  }
});
