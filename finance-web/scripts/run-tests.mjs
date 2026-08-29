import { readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const projectRoot = decodeURIComponent(root.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const syntaxRoots = ["src", "tests", "scripts"];
const excludedUnitTests = new Set([
  "acceptance-isolation.test.mjs",
  "firestore-rules.emulator.test.mjs",
  "functions-emulator.test.mjs",
  "sync-conflict-browser.emulator.test.mjs",
]);
const testFiles = readdirSync(join(projectRoot, "tests"))
  .filter((name) => /\.test\.(mjs|js)$/.test(name) && !excludedUnitTests.has(name))
  .sort()
  .map((name) => `tests/${name}`);

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(path);
    return [".js", ".mjs"].includes(extname(entry.name)) ? [path] : [];
  });
}

function runNode(args, label) {
  console.log(`\n> ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const path of syntaxRoots.flatMap((directory) => collectJavaScriptFiles(join(projectRoot, directory)))) {
  runNode(["--check", path], `syntax ${relative(projectRoot, path)}`);
}
runNode(["--check", "functions/index.js"], "syntax functions/index.js");

for (const testFile of testFiles) {
  runNode([testFile], testFile);
}

console.log("\nAll unit and syntax tests passed.");
