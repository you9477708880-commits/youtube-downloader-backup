import { readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const projectRoot = decodeURIComponent(root.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const syntaxRoots = ["src", "tests", "scripts"];
const testFiles = [
  "tests/balance-sheet-controller.test.mjs",
  "tests/wishlist-controller.test.mjs",
  "tests/sinking-fund-controller.test.mjs",
  "tests/controller-lifecycle.test.mjs",
  "tests/storage-local.test.mjs",
  "tests/record-codec.test.mjs",
  "tests/latest-write-queue.test.mjs",
  "tests/storage-cloud.test.mjs",
  "tests/storage-cloud-records.test.mjs",
  "tests/security-boundaries.test.js",
  "tests/domain.test.mjs",
];

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
