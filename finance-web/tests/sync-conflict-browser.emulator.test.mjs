import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PROJECT_ID = "demo-finance-web";
const EMAIL = "browser-sync@example.test";
const PASSWORD = "browser-sync-test-123";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const firebaseVendorRoot = resolve(projectRoot, "node_modules", "firebase");
const allowedVendorFiles = new Set(["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"]);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function browserCandidates() {
  return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
}

async function existingBrowsers() {
  const browsers = [];
  for (const candidate of browserCandidates()) {
    try {
      if ((await stat(candidate)).isFile()) browsers.push(candidate);
    } catch {
      // Try the next installed browser location.
    }
  }
  return browsers;
}

function safePath(pathname) {
  if (pathname.startsWith("/vendor/")) {
    const filename = pathname.slice("/vendor/".length);
    return allowedVendorFiles.has(filename) ? resolve(firebaseVendorRoot, filename) : null;
  }
  const decoded = decodeURIComponent(pathname === "/" ? "/tests/sync-conflict-browser-harness.html" : pathname);
  const target = resolve(projectRoot, `.${decoded}`);
  const scoped = relative(projectRoot, target);
  return scoped.startsWith("..") || scoped.includes(":") ? null : target;
}

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
}

function close(server) {
  return new Promise((resolvePromise) => server.close(resolvePromise));
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function createCdpPipe(child) {
  let nextId = 1;
  let buffer = "";
  const pending = new Map();
  child.stdio[4].on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const messages = buffer.split("\0");
    buffer = messages.pop() || "";
    messages.filter(Boolean).forEach((message) => {
      const payload = JSON.parse(message);
      if (!payload.id || !pending.has(payload.id)) return;
      const { resolve: resolvePending, reject, timer } = pending.get(payload.id);
      pending.delete(payload.id);
      clearTimeout(timer);
      if (payload.error) reject(new Error(payload.error.message));
      else resolvePending(payload.result);
    });
  });
  return {
    send(method, params = {}, sessionId = undefined) {
      return new Promise((resolvePending, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }, 5000);
        pending.set(id, { resolve: resolvePending, reject, timer });
        child.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
      });
    },
  };
}

function runBrowser(browserPath, profile, url, plan) {
  const gpuArgs = plan === "swiftshader"
    ? ["--use-angle=swiftshader", "--use-gl=angle"]
    : ["--disable-gpu", "--disable-gpu-compositing", "--disable-vulkan"];
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-component-update",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-proxy-server",
    ...gpuArgs,
    `--user-data-dir=${profile}`,
    "--remote-debugging-pipe",
    url,
  ];
  return new Promise((resolvePromise) => {
    let stderr = "";
    const child = spawn(browserPath, args, { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] });
    const cdp = createCdpPipe(child);
    let settled = false;
    let finishedValue = null;
    let exitFallback = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      finishedValue = value;
      child.kill("SIGKILL");
      exitFallback = setTimeout(() => resolvePromise(value), 2000);
    };
    const timer = setTimeout(() => finish({ ok: false, stdout: "", stderr: `${stderr}\ntimeout` }), 45000);
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    (async () => {
      try {
        const targetStartedAt = Date.now();
        let target = null;
        while (!target && Date.now() - targetStartedAt < 10000) {
          const { targetInfos = [] } = await cdp.send("Target.getTargets");
          target = targetInfos.find((item) => item.type === "page" && item.url.startsWith(url));
          if (!target) await delay(100);
        }
        if (!target) throw new Error("Browser debug target did not start");
        const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
        const startedAt = Date.now();
        while (!settled && Date.now() - startedAt < 30000) {
          const evaluation = await cdp.send("Runtime.evaluate", {
            expression: `(() => {
              const node = document.getElementById("sync-e2e-result");
              return node ? { status: node.dataset.status, text: node.textContent, html: document.documentElement.outerHTML } : null;
            })()`,
            returnByValue: true,
          }, sessionId);
          const snapshot = evaluation?.result?.value;
          if (snapshot?.status === "pass" || snapshot?.status === "fail") {
            clearTimeout(timer);
            finish({ ok: snapshot.status === "pass", stdout: snapshot.html, stderr: `${stderr}\n${snapshot.text}` });
            return;
          }
          await delay(100);
        }
        clearTimeout(timer);
        finish({ ok: false, stdout: "", stderr: `${stderr}\npage result timed out` });
      } catch (error) {
        clearTimeout(timer);
        finish({ ok: false, stdout: "", stderr: `${stderr}\n${error.message}` });
      }
    })();
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, stdout: "", stderr: `${stderr}\n${error.message}` });
    });
    child.on("exit", () => {
      clearTimeout(timer);
      if (settled) {
        clearTimeout(exitFallback);
        resolvePromise(finishedValue);
        return;
      }
      settled = true;
      resolvePromise({ ok: false, stdout: "", stderr: `${stderr}\nbrowser exited before result` });
    });
  });
}

async function resetEmulators() {
  const [auth, firestore] = await Promise.all([
    fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" }),
    fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" }),
  ]);
  assert.equal(auth.ok, true, `Auth emulator reset failed: ${auth.status}`);
  assert.equal(firestore.ok, true, `Firestore emulator reset failed: ${firestore.status}`);
}

async function createUser() {
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload.localId;
}

test("two isolated browsers distinguish equivalent data from a real conflict and recover without JSON", { timeout: 180000 }, async () => {
  await resetEmulators();
  let uid = await createUser();
  const requestedPaths = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      requestedPaths.push(url.pathname);
      const path = safePath(url.pathname);
      if (!path) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      let content = await readFile(path);
      if (url.pathname === "/vendor/firebase-auth.js" || url.pathname === "/vendor/firebase-firestore.js") {
        content = Buffer.from(
          content.toString("utf8").replace(
            "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js",
            "./firebase-app.js",
          ),
          "utf8",
        );
      }
      response.writeHead(200, {
        "Content-Type": mimeTypes.get(extname(path)) || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end("Not Found");
    }
  });
  await listen(server);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/tests/sync-conflict-browser-harness.html`;
  const tempRoot = await mkdtemp(join(tmpdir(), "finance-sync-e2e-"));
  const failures = [];

  try {
    const browsers = await existingBrowsers();
    assert.ok(browsers.length, "Chrome or Edge is required for the browser emulator test");
    let completed = false;
    let attempt = 0;
    for (const browser of browsers) {
      for (const plan of ["software", "swiftshader"]) {
        attempt += 1;
        const profileA = join(tempRoot, `attempt-${attempt}-browser-a`);
        const profileB = join(tempRoot, `attempt-${attempt}-browser-b`);
        const runs = [];
        for (const [role, profile] of [["seed", profileA], ["equal", profileB], ["conflict", profileB]]) {
          const url = `${baseUrl}?role=${role}&uid=${encodeURIComponent(uid)}&email=${encodeURIComponent(EMAIL)}`;
          const result = await runBrowser(browser, profile, url, plan);
          runs.push({ role, ...result });
          if (!result.ok) break;
        }
        if (runs.length === 3 && runs.every((run) => run.ok)) {
          completed = true;
          break;
        }
        failures.push(`${browser} / ${plan}: ${runs.map((run) => `${run.role}=${run.ok ? "pass" : "fail"}`).join(", ")}\nrequests=${[...new Set(requestedPaths)].join(",")}\n${runs.at(-1)?.stderr || ""}\n${runs.at(-1)?.stdout || ""}`);
        await resetEmulators();
        uid = await createUser();
      }
      if (completed) break;
    }
    assert.equal(completed, true, failures.join("\n\n"));
  } finally {
    await close(server);
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    await resetEmulators();
  }
});
