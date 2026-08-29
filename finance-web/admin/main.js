import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { createToastManager } from "../src/ui/toast.js";

const firebaseConfig = JSON.parse(globalThis.__firebase_config || "{}");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const els = {
  loginBtn: document.getElementById("login-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  sessionPill: document.getElementById("session-pill"),
  profileState: document.getElementById("profile-state"),
  profileBox: document.getElementById("profile-box"),
  usersBox: document.getElementById("users-box"),
  summaryBox: document.getElementById("summary-box"),
  summaryState: document.getElementById("summary-state"),
};

const toast = createToastManager(document);

const state = {
  user: null,
  token: "",
  users: [],
  selectedUid: "",
  isAdmin: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function api(path, options = {}) {
  if (!state.token) throw new Error("not-authenticated");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `request-failed-${response.status}`);
  }
  return payload;
}

function renderSessionPill() {
  if (!state.user) {
    els.sessionPill.className = "session-pill neutral";
    els.sessionPill.textContent = "尚未登入";
    return;
  }

  if (!state.isAdmin) {
    els.sessionPill.className = "session-pill denied";
    els.sessionPill.textContent = "沒有管理權限";
    return;
  }

  els.sessionPill.className = "session-pill admin";
  els.sessionPill.textContent = `管理員: ${state.user.displayName || state.user.email || state.user.uid}`;
}

function renderProfile(profile = null) {
  if (!state.user) {
    els.profileState.className = "bdg bdg-a";
    els.profileState.textContent = "待登入";
    els.profileBox.innerHTML = '<div class="empty">請先用管理員 Google 帳號登入。</div>';
    return;
  }

  if (!state.isAdmin || !profile) {
    els.profileState.className = "bdg bdg-r";
    els.profileState.textContent = "已拒絕";
    els.profileBox.innerHTML = `
      <div class="empty">
        這個帳號目前沒有管理權限。請改用白名單中的 Google 帳號登入。
      </div>
    `;
    return;
  }

  els.profileState.className = "bdg bdg-g";
  els.profileState.textContent = "管理員";
  els.profileBox.innerHTML = `
    <div class="profile-list">
      <div class="profile-line"><strong>顯示名稱</strong><span>${escapeHtml(profile.displayName || "—")}</span></div>
      <div class="profile-line"><strong>Email</strong><span>${escapeHtml(profile.email || "—")}</span></div>
      <div class="profile-line"><strong>UID</strong><span>${escapeHtml(profile.uid || "—")}</span></div>
      <div class="profile-line"><strong>角色</strong><span>${escapeHtml(profile.role || "viewer")}</span></div>
    </div>
  `;
}

function renderUsers() {
  if (!state.user) {
    els.usersBox.innerHTML = '<div class="empty">登入後會在這裡顯示使用者清單。</div>';
    return;
  }

  if (!state.isAdmin) {
    els.usersBox.innerHTML = '<div class="empty">你目前沒有查看所有使用者的權限。</div>';
    return;
  }

  if (!state.users.length) {
    els.usersBox.innerHTML = '<div class="empty">目前還沒有可顯示的使用者。</div>';
    return;
  }

  els.usersBox.innerHTML = `
    <div class="admin-user-list">
      ${state.users
        .map((user) => {
          const activeClass = user.uid === state.selectedUid ? "active" : "";
          const name = user.displayName || user.email || "匿名 / 無名稱";
          const providerLabel = user.isAnonymous ? "匿名" : user.providers.join(", ") || "Google";
          return `
            <div class="admin-user-card ${activeClass}">
              <div class="admin-user-main">
                <div class="admin-user-name">${escapeHtml(name)}</div>
                <div class="admin-user-email">${escapeHtml(user.email || user.uid)}</div>
                <div class="admin-user-meta">
                  建立: ${escapeHtml(fmtDate(user.createdAt))}<br>
                  最近登入: ${escapeHtml(fmtDate(user.lastSignInAt))}<br>
                  身分: ${escapeHtml(providerLabel)}
                </div>
              </div>
              <div class="admin-user-actions">
                <button class="sbtn outline compact" data-action="inspect-user" data-uid="${escapeHtml(user.uid)}">查看</button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSummary(summary = null) {
  if (!summary) {
    els.summaryState.textContent = "尚未選擇";
    els.summaryBox.innerHTML = '<div class="empty">點選左側使用者後，這裡會顯示資料摘要與管理按鈕。</div>';
    return;
  }

  const targetLabel = summary.user?.displayName || summary.user?.email || summary.user?.uid || "未知使用者";
  els.summaryState.textContent = targetLabel;

  els.summaryBox.innerHTML = `
    <div class="summary-grid">
      <div class="summary-stat">
        <div class="lb">資料文件</div>
        <div class="vl">${summary.hasFinanceDoc ? "存在" : "沒有"}</div>
      </div>
      <div class="summary-stat">
        <div class="lb">最後更新</div>
        <div class="vl">${escapeHtml(fmtDate(summary.lastUpdatedAt))}</div>
      </div>
      <div class="summary-stat">
        <div class="lb">交易數量</div>
        <div class="vl">${escapeHtml(summary.counts?.transactions ?? 0)}</div>
      </div>
      <div class="summary-stat">
        <div class="lb">願望清單</div>
        <div class="vl">${escapeHtml(summary.counts?.wishes ?? 0)}</div>
      </div>
    </div>

    <div class="summary-list">
      <div class="summary-row"><span>UID</span><span>${escapeHtml(summary.user?.uid || "—")}</span></div>
      <div class="summary-row"><span>Email</span><span>${escapeHtml(summary.user?.email || "—")}</span></div>
      <div class="summary-row"><span>帳戶數量</span><span>${escapeHtml(summary.counts?.accounts ?? 0)}</span></div>
      <div class="summary-row"><span>分類預算數量</span><span>${escapeHtml(summary.counts?.categoryBudgets ?? 0)}</span></div>
      <div class="summary-row"><span>權威資料版本</span><span>${escapeHtml(summary.storage?.authoritativeSource || "none")}</span></div>
      <div class="summary-row"><span>v7 有效／刪除紀錄</span><span>${escapeHtml(summary.storage?.v7ActiveCount ?? 0)}／${escapeHtml(summary.storage?.v7TombstoneCount ?? 0)}</span></div>
      <div class="summary-row"><span>估算資料大小</span><span>${escapeHtml(summary.approxBytes ?? 0)} bytes</span></div>
    </div>

    <div class="danger-zone">
      <h3>危險操作</h3>
      <div class="danger-actions">
        <button class="sbtn outline danger compact" data-action="delete-data" data-uid="${escapeHtml(summary.user?.uid || "")}">
          刪除這位使用者的資料
        </button>
        <button class="sbtn outline danger compact" data-action="delete-account" data-uid="${escapeHtml(summary.user?.uid || "")}">
          只刪除登入帳號（保留雲端資料）
        </button>
        <button class="sbtn outline danger compact" data-action="delete-full" data-uid="${escapeHtml(summary.user?.uid || "")}">
          刪除帳號 + 資料
        </button>
      </div>
    </div>
  `;
}

async function loadProfileAndUsers() {
  try {
    const profile = await api("/profile");
    state.isAdmin = Boolean(profile.isAdmin);
    renderSessionPill();
    renderProfile(profile);
    els.logoutBtn.disabled = false;
    els.refreshBtn.disabled = !state.isAdmin;

    if (!state.isAdmin) {
      state.users = [];
      renderUsers();
      renderSummary(null);
      return;
    }

    const result = await api("/users");
    state.users = result.users || [];
    renderUsers();
  } catch (error) {
    state.isAdmin = false;
    renderSessionPill();
    renderProfile(null);
    renderUsers();
    renderSummary(null);
    els.refreshBtn.disabled = true;
    if (error.message !== "forbidden") {
      toast.show("後台 API 尚未可用，請先部署 Cloud Functions", "error");
    }
  }
}

async function inspectUser(uid) {
  try {
    state.selectedUid = uid;
    renderUsers();
    els.summaryState.textContent = "讀取中...";
    const summary = await api(`/users/${uid}/summary`);
    renderSummary(summary);
  } catch (error) {
    renderSummary(null);
    toast.show("讀取使用者摘要失敗", "error");
  }
}

async function deleteTarget(uid, mode) {
  const labels = {
    data: "刪除資料",
    account: "刪除帳號",
    full: "刪除帳號與資料",
  };
  const notes = {
    data: "登入帳號會保留；仍在線的舊裝置可能再次同步資料。",
    account: "Firestore 雲端帳務資料會保留。",
    full: "登入帳號與這位使用者的 v6/v7 雲端資料都會刪除。",
  };
  if (!window.confirm(`確定要${labels[mode]}嗎？${notes[mode]}這個操作不可復原。`)) return;

  try {
    await api(`/users/${uid}/${mode}`, { method: "DELETE" });
    toast.show(`${labels[mode]}完成`);
    await loadProfileAndUsers();
    renderSummary(null);
  } catch (error) {
    toast.show(`${labels[mode]}失敗`, "error");
  }
}

els.loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    toast.show("Google 登入失敗", "error");
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

els.refreshBtn.addEventListener("click", async () => {
  await loadProfileAndUsers();
});

els.usersBox.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action='inspect-user']");
  if (!button) return;
  await inspectUser(button.dataset.uid);
});

els.summaryBox.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const uid = button.dataset.uid;
  if (!uid) return;

  if (button.dataset.action === "delete-data") await deleteTarget(uid, "data");
  if (button.dataset.action === "delete-account") await deleteTarget(uid, "account");
  if (button.dataset.action === "delete-full") await deleteTarget(uid, "full");
});

onAuthStateChanged(auth, async (user) => {
  state.user = user && !user.isAnonymous ? user : null;
  state.token = state.user ? await state.user.getIdToken() : "";
  state.users = [];
  state.selectedUid = "";
  state.isAdmin = false;
  renderSessionPill();
  renderProfile(null);
  renderUsers();
  renderSummary(null);
  els.logoutBtn.disabled = !state.user;
  els.refreshBtn.disabled = true;

  if (state.user) {
    await loadProfileAndUsers();
  }
});
