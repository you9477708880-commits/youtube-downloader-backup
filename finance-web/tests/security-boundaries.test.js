const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".firebase-public");

function listOutputFiles(directory = outputRoot) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listOutputFiles(fullPath));
    else files.push(path.relative(outputRoot, fullPath).split(path.sep).join("/"));
  }
  return files.sort();
}

function testProductionEntryCannotRunSmokeScenarios() {
  const source = fs.readFileSync(path.join(projectRoot, "src", "main.js"), "utf8");
  assert.doesNotMatch(source, /smoke-scenarios|["']smoke["']|URLSearchParams/);
}

function testHostingUsesGeneratedAllowlist() {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, "firebase.json"), "utf8"));
  assert.equal(config.hosting.public, ".firebase-public");
  assert.ok(config.hosting.predeploy.includes("node scripts/prepare-hosting.js"));

  const result = spawnSync(process.execPath, ["scripts/prepare-hosting.js"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const files = listOutputFiles();
  assert.ok(files.includes("index.html"));
  assert.ok(files.includes("404.html"));
  assert.ok(files.includes("src/main.js"));
  assert.ok(files.includes("admin/main.js"));
  assert.ok(files.some((file) => file.startsWith("assets/")));

  const allowedTopLevel = new Set(["index.html", "404.html", "assets", "src", "admin"]);
  files.forEach((file) => {
    assert.ok(allowedTopLevel.has(file.split("/")[0]), `Unexpected Hosting file: ${file}`);
  });

  const forbiddenPatterns = [
    /^docs\//,
    /^tests\//,
    /^functions\//,
    /smoke-scenarios\.js$/,
    /\.md$/i,
    /\.epub$/i,
    /(^|\/)firestore\.rules$/,
    /(^|\/)firebase\.json$/,
  ];
  files.forEach((file) => {
    forbiddenPatterns.forEach((pattern) => {
      assert.doesNotMatch(file, pattern, `Forbidden Hosting file: ${file}`);
    });
  });
}

function testFirestoreRecordBoundaries() {
  const rules = fs.readFileSync(path.join(projectRoot, "firestore.rules"), "utf8");
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /sync\/\{syncId\}\/records\/\{recordKey\}/);
  assert.match(rules, /request\.resource\.data\.revision == resource\.data\.revision \+ 1/);
  assert.match(rules, /request\.resource\.data\.revision == 1/);
  assert.match(rules, /request\.resource\.data\.updatedAt == request\.time/);
  assert.match(rules, /request\.resource\.data\.deletedAt == request\.time/);
  assert.match(rules, /request\.resource\.data\.migrationId == meta\.migrationId/);
  assert.match(rules, /allow write: if ownsUserData\(userId\)\s*&& !exists\(v7MetaPath\(appId, userId\)\)/);
  assert.match(rules, /allow delete: if false/);
  assert.match(rules, /get\(v7MetaPath\(appId, userId\)\)\.data\.status == 'active'/);
}

try {
  testProductionEntryCannotRunSmokeScenarios();
  testHostingUsesGeneratedAllowlist();
  testFirestoreRecordBoundaries();
  console.log("Security boundary tests passed");
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}
