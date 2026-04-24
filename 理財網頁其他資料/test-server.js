const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const args = process.argv.slice(2);
const rootArg = args.find((arg) => arg.startsWith("--root="));
const root = path.resolve((rootArg || "").slice("--root=".length) || __dirname);
const defaultEntry = fs.existsSync(path.join(root, "index.html")) ? "index.html" : "\u7406\u8CA1\u8A08\u7B97.html";
const requestedEntry = args.find((arg) => !arg.startsWith("--")) || defaultEntry;
const headlessMode = args.includes("--headless");
const portArg = args.find((arg) => arg.startsWith("--port="));
const port = Number((portArg || "").split("=")[1]) || 4173;
const reportPath = path.join(__dirname, "headless-report.html");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function resolveChromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function safeJoin(base, targetPath) {
  const normalized = targetPath === "/" ? `/${requestedEntry}` : targetPath;
  const resolved = path.resolve(path.join(base, decodeURIComponent(normalized)));
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractTagText(dom, tagName) {
  const match = dom.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return normalizeWhitespace(match ? match[1] : "");
}

function extractTextById(dom, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = dom.match(new RegExp(`<[^>]+id=["']${escapedId}["'][^>]*>([\\s\\S]*?)</[^>]+>`, "i"));
  if (!match) return "";
  return normalizeWhitespace(match[1].replace(/<[^>]+>/g, " "));
}

function buildSummary(dom, url, browserPath) {
  const navMatches = [...dom.matchAll(/<button[^>]+data-target=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi)];
  const navTabs = navMatches.map((match) => ({
    target: match[1],
    label: normalizeWhitespace(match[2].replace(/<[^>]+>/g, " ")),
  }));

  return {
    generatedAt: new Date().toLocaleString(),
    url,
    browserPath,
    title: extractTagText(dom, "title"),
    cloudStatus: extractTextById(dom, "cloud-status"),
    headerSub: extractTextById(dom, "hdr-s"),
    overviewIncome: extractTextById(dom, "o-i"),
    overviewExpense: extractTextById(dom, "o-e"),
    overviewNet: extractTextById(dom, "o-n"),
    overviewBudget: extractTextById(dom, "o-bud"),
    navTabs,
    domLength: dom.length,
  };
}

function writeReport(summary, dom) {
  const navList = summary.navTabs.length
    ? summary.navTabs.map((tab) => `<li><strong>${escapeHtml(tab.target)}</strong>: ${escapeHtml(tab.label || "(empty)")}</li>`).join("")
    : "<li>No nav tabs found.</li>";

  const reportHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Headless Test Report</title>
<style>
  :root {
    --bg: #f4efe8;
    --panel: #fffaf5;
    --line: #d8c7b8;
    --text: #2f241b;
    --muted: #7a695c;
    --accent: #0f766e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    font-family: "Segoe UI", "Noto Sans TC", sans-serif;
    background: linear-gradient(180deg, #f6f0e8 0%, #efe4d6 100%);
    color: var(--text);
  }
  .wrap {
    max-width: 980px;
    margin: 0 auto;
    display: grid;
    gap: 16px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 10px 30px rgba(47, 36, 27, 0.08);
  }
  h1, h2 { margin: 0 0 12px; }
  h1 { font-size: 28px; }
  h2 { font-size: 18px; }
  p { margin: 6px 0; color: var(--muted); }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .metric {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 14px;
    background: #fff;
  }
  .metric .label {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 6px;
  }
  .metric .value {
    font-size: 18px;
    font-weight: 600;
  }
  ul { margin: 0; padding-left: 18px; }
  code, pre {
    font-family: Consolas, "Courier New", monospace;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    background: #1f1a17;
    color: #f5ede4;
    padding: 16px;
    border-radius: 14px;
    max-height: 420px;
    overflow: auto;
  }
  a { color: var(--accent); }
</style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>Headless Test Report</h1>
      <p>Generated at ${escapeHtml(summary.generatedAt)}</p>
      <p>URL: <a href="${escapeHtml(summary.url)}">${escapeHtml(summary.url)}</a></p>
      <p>Browser: ${escapeHtml(summary.browserPath)}</p>
    </section>

    <section class="card">
      <h2>Summary</h2>
      <div class="grid">
        <div class="metric"><div class="label">Title</div><div class="value">${escapeHtml(summary.title || "(empty)")}</div></div>
        <div class="metric"><div class="label">Cloud Status</div><div class="value">${escapeHtml(summary.cloudStatus || "(empty)")}</div></div>
        <div class="metric"><div class="label">Header</div><div class="value">${escapeHtml(summary.headerSub || "(empty)")}</div></div>
        <div class="metric"><div class="label">Income</div><div class="value">${escapeHtml(summary.overviewIncome || "(empty)")}</div></div>
        <div class="metric"><div class="label">Expense</div><div class="value">${escapeHtml(summary.overviewExpense || "(empty)")}</div></div>
        <div class="metric"><div class="label">Net</div><div class="value">${escapeHtml(summary.overviewNet || "(empty)")}</div></div>
        <div class="metric"><div class="label">Budget</div><div class="value">${escapeHtml(summary.overviewBudget || "(empty)")}</div></div>
        <div class="metric"><div class="label">DOM Length</div><div class="value">${escapeHtml(summary.domLength)}</div></div>
      </div>
    </section>

    <section class="card">
      <h2>Nav Tabs</h2>
      <ul>${navList}</ul>
    </section>

    <section class="card">
      <h2>DOM Snapshot</h2>
      <pre>${escapeHtml(dom.slice(0, 12000))}</pre>
    </section>
  </div>
</body>
</html>`;

  fs.writeFileSync(reportPath, reportHtml, "utf8");
}

const server = http.createServer((req, res) => {
  const requestPath = (req.url || "/").split("?")[0];
  const filePath = safeJoin(root, requestPath);

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    res.end(data);
  });
});

function shutdown(code = 0) {
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 500).unref();
}

server.listen(port, "localhost", () => {
  const url = `http://localhost:${port}/${encodeURI(requestedEntry)}`;
  console.log(`Serving ${requestedEntry} at ${url}`);
  console.log(`Root: ${root}`);

  if (!headlessMode) {
    console.log("Press Ctrl+C to stop.");
    return;
  }

  const chromePath = resolveChromePath();
  if (!chromePath) {
    console.error("No Chrome/Edge executable found.");
    shutdown(1);
    return;
  }

  let chrome;
  try {
    chrome = spawn(
      chromePath,
      ["--headless", "--disable-gpu", "--virtual-time-budget=6000", "--dump-dom", url],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    console.error(`Unable to start headless browser: ${error.message}`);
    console.error("If you are running this from Codex/sandbox, run the same command in your own PowerShell window.");
    shutdown(1);
    return;
  }

  let stdout = "";
  let stderr = "";

  chrome.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });

  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  chrome.on("exit", (code) => {
    const dom = stdout.trim();
    if (!dom) {
      console.error("Headless browser returned no DOM output.");
      if (stderr.trim()) console.error(stderr.trim());
      shutdown(code || 1);
      return;
    }

    const summary = buildSummary(dom, url, chromePath);
    writeReport(summary, dom);

    console.log("");
    console.log("Headless summary");
    console.log(`- Title: ${summary.title || "(empty)"}`);
    console.log(`- Cloud status: ${summary.cloudStatus || "(empty)"}`);
    console.log(`- Header: ${summary.headerSub || "(empty)"}`);
    console.log(`- Overview: ${summary.overviewIncome || "(empty)"} / ${summary.overviewExpense || "(empty)"} / ${summary.overviewNet || "(empty)"}`);
    console.log(`- Budget: ${summary.overviewBudget || "(empty)"}`);
    console.log(`- Nav tabs: ${summary.navTabs.map((tab) => `${tab.target}:${tab.label}`).join(" | ") || "(none)"}`);
    console.log(`- Report: ${reportPath}`);

    if (stderr.trim()) {
      console.log("");
      console.log("Browser stderr");
      console.log(stderr.trim());
    }

    shutdown(code || 0);
  });

  chrome.on("error", (error) => {
    console.error(`Unable to start headless browser: ${error.message}`);
    console.error("If you are running this from Codex/sandbox, run the same command in your own PowerShell window.");
    shutdown(1);
  });
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
