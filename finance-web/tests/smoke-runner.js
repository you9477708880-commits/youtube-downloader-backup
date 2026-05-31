const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const args = process.argv.slice(2);
const root = path.resolve(getArg("root") || path.join(__dirname, ".."));
const entry = getFreeArg() || (fs.existsSync(path.join(root, "index.html")) ? "index.html" : "理財計算.html");
const port = Number(getArg("port")) || 4173;
const reportPath = path.resolve(getArg("report") || path.join(os.tmpdir(), "finance-web-smoke-report.html"));
const scenarioArg = getArg("scenario") || "";
const scenarios = scenarioArg.split(",").map((item) => item.trim()).filter(Boolean);
const keepOpen = args.includes("--serve");
const verbose = args.includes("--verbose");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
};

function getArg(name) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function getFreeArg() {
  return args.find((arg) => !arg.startsWith("--")) || "";
}

function safeJoin(base, targetPath) {
  const requestPath = targetPath === "/" ? `/${entry}` : targetPath;
  const decoded = decodeURIComponent(requestPath);
  const resolved = path.resolve(path.join(base, decoded));
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
  const escapedId = escapeRegExp(id);
  const match = dom.match(new RegExp(`<[^>]+id=["']${escapedId}["'][^>]*>([\\s\\S]*?)</[^>]+>`, "i"));
  if (!match) return "";
  return normalizeWhitespace(match[1].replace(/<[^>]+>/g, " "));
}

function extractDatasetValueById(dom, id, dataKey) {
  const escapedId = escapeRegExp(id);
  const escapedDataKey = escapeRegExp(dataKey);
  const match = dom.match(new RegExp(`<[^>]+id=["']${escapedId}["'][^>]*data-${escapedDataKey}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? match[1] : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createServer() {
  return http.createServer((req, res) => {
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
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  });
}

function browserCandidates() {
  return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((candidate) => fs.existsSync(candidate));
}

function launchPlans(browserPath, userDataDir, url) {
  const shared = [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-proxy-server",
    "--disable-background-mode",
    "--password-store=basic",
    "--use-mock-keychain",
    `--user-data-dir=${userDataDir}`,
    "--virtual-time-budget=8000",
    "--dump-dom",
    url,
  ];

  return [
    {
      label: "headless-new-stable",
      browserPath,
      args: [
        "--headless=new",
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-gpu-rasterization",
        "--disable-oop-rasterization",
        "--disable-zero-copy",
        "--disable-accelerated-2d-canvas",
        "--disable-accelerated-video-decode",
        "--disable-vulkan",
        "--disable-software-rasterizer",
        "--disable-dev-shm-usage",
        "--disable-features=Translate,MediaRouter,OptimizationHints,VizDisplayCompositor,UseSkiaRenderer",
        ...shared,
      ],
    },
    {
      label: "headless-classic",
      browserPath,
      args: [
        "--headless",
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-gpu-rasterization",
        "--disable-oop-rasterization",
        "--disable-zero-copy",
        "--disable-accelerated-2d-canvas",
        "--disable-accelerated-video-decode",
        "--disable-vulkan",
        "--disable-software-rasterizer",
        "--disable-dev-shm-usage",
        "--disable-features=Translate,MediaRouter,OptimizationHints",
        ...shared,
      ],
    },
    {
      label: "single-process-fallback",
      browserPath,
      args: [
        "--headless=new",
        "--no-sandbox",
        "--single-process",
        "--use-gl=disabled",
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-gpu-rasterization",
        "--disable-vulkan",
        "--disable-features=Translate,MediaRouter,OptimizationHints",
        ...shared,
      ],
    },
    {
      label: "swiftshader-fallback",
      browserPath,
      args: [
        "--headless=new",
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--use-gl=angle",
        "--disable-features=Translate,MediaRouter,OptimizationHints,VizDisplayCompositor",
        ...shared,
      ],
    },
  ];
}

function runBrowser(plan) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(plan.browserPath, plan.args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      killProcessTree(child.pid);
      resolve({ ok: false, code: 124, stdout, stderr: `${stderr}\nTimed out after 30 seconds.`.trim() });
    }, 30000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      const dom = stdout.trim();
      resolve({ ok: Boolean(dom), code: code || 0, stdout: dom, stderr: stderr.trim() });
    });
  });
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // Best effort cleanup only. The runner will still report the failed attempt.
  }
}

function summarize(dom, url, scenario, browserPath, planLabel) {
  const navMatches = [...dom.matchAll(/<button[^>]+data-target=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi)];
  const navTabs = navMatches.map((match) => ({
    target: match[1],
    label: normalizeWhitespace(match[2].replace(/<[^>]+>/g, " ")),
  }));

  return {
    generatedAt: new Date().toLocaleString(),
    url,
    scenario,
    browserPath,
    planLabel,
    title: extractTagText(dom, "title"),
    cloudStatus: extractTextById(dom, "cloud-status"),
    headerSub: extractTextById(dom, "hdr-s"),
    overviewIncome: extractTextById(dom, "o-i"),
    overviewExpense: extractTextById(dom, "o-e"),
    overviewNet: extractTextById(dom, "o-n"),
    overviewBudget: extractTextById(dom, "o-bud"),
    smokeStatus: extractDatasetValueById(dom, "smoke-result", "status"),
    smokeResult: extractTextById(dom, "smoke-result"),
    smokeDetail: extractTextById(dom, "smoke-detail"),
    navTabs,
    domLength: dom.length,
  };
}

function writeReport(results) {
  const resultCards = results.map((result) => {
    const status = result.summary?.smokeStatus || (result.ok ? "pass" : "fail");
    const navList = result.summary?.navTabs?.length
      ? result.summary.navTabs.map((tab) => `<li><strong>${escapeHtml(tab.target)}</strong>: ${escapeHtml(tab.label || "(empty)")}</li>`).join("")
      : "<li>No nav tabs found.</li>";
    return `<section class="card">
      <h2>${escapeHtml(result.scenario || "(default)")}: ${escapeHtml(status)}</h2>
      <p>URL: <a href="${escapeHtml(result.url)}">${escapeHtml(result.url)}</a></p>
      <p>Browser: ${escapeHtml(result.summary?.browserPath || result.browserPath || "(none)")}</p>
      <p>Launch plan: ${escapeHtml(result.summary?.planLabel || result.planLabel || "(none)")}</p>
      <div class="grid">
        <div class="metric"><div class="label">Title</div><div class="value">${escapeHtml(result.summary?.title || "(empty)")}</div></div>
        <div class="metric"><div class="label">Cloud Status</div><div class="value">${escapeHtml(result.summary?.cloudStatus || "(empty)")}</div></div>
        <div class="metric"><div class="label">Smoke Result</div><div class="value">${escapeHtml(result.summary?.smokeResult || "(none)")}</div></div>
        <div class="metric"><div class="label">Smoke Detail</div><div class="value">${escapeHtml(result.summary?.smokeDetail || "(none)")}</div></div>
        <div class="metric"><div class="label">DOM Length</div><div class="value">${escapeHtml(result.summary?.domLength || 0)}</div></div>
      </div>
      <h3>Nav Tabs</h3>
      <ul>${navList}</ul>
      ${result.stderr ? `<h3>Browser stderr</h3><pre>${escapeHtml(result.stderr.slice(0, 4000))}</pre>` : ""}
    </section>`;
  }).join("\n");

  const reportHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Finance Web Smoke Report</title>
<style>
  :root { --bg: #f5f2ee; --panel: #fff; --line: #ddd6ce; --text: #24211f; --muted: #706861; --accent: #0f766e; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: "Segoe UI", "Noto Sans TC", sans-serif; background: var(--bg); color: var(--text); }
  .wrap { max-width: 1080px; margin: 0 auto; display: grid; gap: 16px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; }
  h1, h2, h3 { margin: 0 0 12px; }
  h1 { font-size: 26px; }
  h2 { font-size: 18px; }
  h3 { font-size: 15px; margin-top: 18px; }
  p { margin: 6px 0; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .metric { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fff; }
  .label { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
  .value { font-size: 16px; font-weight: 600; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: #211f1d; color: #f5eee8; padding: 14px; border-radius: 8px; max-height: 320px; overflow: auto; }
  a { color: var(--accent); }
</style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>Finance Web Smoke Report</h1>
      <p>Generated at ${escapeHtml(new Date().toLocaleString())}</p>
      <p>Root: ${escapeHtml(root)}</p>
    </section>
    ${resultCards}
  </div>
</body>
</html>`;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportHtml, "utf8");
}

async function testScenario(baseUrl, scenario) {
  const url = `${baseUrl}/${encodeURI(entry)}${scenario ? `?smoke=${encodeURIComponent(scenario)}` : ""}`;
  const candidates = browserCandidates();
  if (!candidates.length) {
    return { ok: false, scenario, url, stderr: "No Chrome or Edge executable found." };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-web-smoke-"));
  const errors = [];
  try {
    for (const browserPath of candidates) {
      for (const plan of launchPlans(browserPath, tempRoot, url)) {
        if (verbose) console.log(`Trying ${path.basename(browserPath)} / ${plan.label}`);
        const result = await runBrowser(plan);
        if (!result.ok) {
          errors.push(`${path.basename(browserPath)} / ${plan.label}: ${firstUsefulError(result.stderr)}`);
          continue;
        }

        const summary = summarize(result.stdout, url, scenario, browserPath, plan.label);
        const passed = scenario ? summary.smokeStatus === "pass" : Boolean(summary.title);
        return {
          ok: passed,
          scenario,
          url,
          summary,
          stderr: result.stderr,
          browserPath,
          planLabel: plan.label,
        };
      }
    }
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (error) {
      errors.push(`Unable to remove temporary browser profile: ${error.message}`);
    }
  }

  return {
    ok: false,
    scenario,
    url,
    stderr: errors.join("\n"),
  };
}

function firstUsefulError(stderr) {
  const lines = String(stderr || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fatal = lines.find((line) => /FATAL|GPU process|ERR_|Timed out/i.test(line));
  return fatal || lines.slice(-1)[0] || "no DOM output";
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  const server = createServer();
  await listen(server);

  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Serving ${entry} at ${baseUrl}/${encodeURI(entry)}`);
  console.log(`Root: ${root}`);

  if (keepOpen) {
    console.log("Press Ctrl+C to stop.");
    return;
  }

  const targets = scenarios.length ? scenarios : [""];
  const results = [];
  for (const scenario of targets) {
    const result = await testScenario(baseUrl, scenario);
    results.push(result);
    const summary = result.summary;
    console.log("");
    console.log(`Smoke ${scenario || "(default)"}: ${result.ok ? "PASS" : "FAIL"}`);
    if (summary) {
      console.log(`- Browser: ${path.basename(summary.browserPath)} / ${summary.planLabel}`);
      console.log(`- Title: ${summary.title || "(empty)"}`);
      console.log(`- Cloud status: ${summary.cloudStatus || "(empty)"}`);
      console.log(`- Smoke result: ${summary.smokeResult || "(none)"}`);
      console.log(`- Smoke detail: ${summary.smokeDetail || "(none)"}`);
    } else if (result.stderr) {
      console.log(result.stderr);
    }
  }

  writeReport(results);
  console.log(`\nReport: ${reportPath}`);
  await close(server);

  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
