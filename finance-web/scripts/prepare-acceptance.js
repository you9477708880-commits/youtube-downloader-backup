const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".acceptance-public");
const rootFiles = ["index.html", "404.html"];
const publicDirectories = ["assets", "src"];
const excludedRelativePaths = new Set(["src/smoke-scenarios.js"]);
const runtimeStart = "<!-- FINANCE_RUNTIME_CONFIG_START -->";
const runtimeEnd = "<!-- FINANCE_RUNTIME_CONFIG_END -->";

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertSafeOutputPath() {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe acceptance output path: ${outputRoot}`);
  }
}

function shouldCopy(sourcePath) {
  const relative = toPosix(path.relative(projectRoot, sourcePath));
  return !excludedRelativePaths.has(relative);
}

function copyRequired(sourceRelativePath) {
  const source = path.join(projectRoot, sourceRelativePath);
  const destination = path.join(outputRoot, sourceRelativePath);
  if (!fs.existsSync(source)) throw new Error(`Missing acceptance source: ${sourceRelativePath}`);
  fs.cpSync(source, destination, { recursive: true, filter: shouldCopy });
}

function replaceRuntimeConfig() {
  const indexPath = path.join(outputRoot, "index.html");
  const source = fs.readFileSync(indexPath, "utf8");
  const startIndex = source.indexOf(runtimeStart);
  const endIndex = source.indexOf(runtimeEnd);
  if (startIndex < 0 || endIndex < 0 || source.indexOf(runtimeStart, startIndex + 1) >= 0 || source.indexOf(runtimeEnd, endIndex + 1) >= 0) {
    throw new Error("Acceptance runtime markers must appear exactly once");
  }

  const acceptanceRuntime = `${runtimeStart}
<script>
  Object.defineProperty(window, "__finance_runtime", {
    value: Object.freeze({ mode: "acceptance", cloudEnabled: false, pwaEnabled: false }),
    writable: false,
    configurable: false
  });
  window.__app_id = "financial-computer-acceptance";
  window.__firebase_config = "{}";
  document.documentElement.dataset.financeRuntime = "acceptance";
</script>
${runtimeEnd}`;
  const next = `${source.slice(0, startIndex)}${acceptanceRuntime}${source.slice(endIndex + runtimeEnd.length)}`;
  fs.writeFileSync(indexPath, next, "utf8");
}

function prepareAcceptanceDirectory() {
  assertSafeOutputPath();
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  rootFiles.forEach(copyRequired);
  publicDirectories.forEach(copyRequired);
  replaceRuntimeConfig();
  console.log(`Prepared isolated acceptance files in ${outputRoot}`);
}

prepareAcceptanceDirectory();
