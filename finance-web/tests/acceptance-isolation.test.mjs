import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { evaluateProductionDeploy, __productionDeployGuardTestUtils } from "../scripts/production-deploy-guard.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(projectRoot, ".acceptance-public");

function listFiles(directory = outputRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory()
      ? listFiles(fullPath)
      : [relative(outputRoot, fullPath).split(sep).join("/")];
  }).sort();
}

test("acceptance artifact is visibly isolated and excludes production-only surfaces", () => {
  const files = listFiles();
  const index = readFileSync(join(outputRoot, "index.html"), "utf8");

  assert.ok(files.includes("index.html"));
  assert.ok(files.includes("src/main.js"));
  assert.ok(files.includes("src/config/runtime.js"));
  assert.ok(files.some((file) => file.startsWith("assets/")));
  assert.ok(!files.some((file) => file.startsWith("admin/")));
  assert.ok(!files.includes("sw.js"));
  assert.ok(!files.includes("manifest.webmanifest"));
  assert.ok(!files.includes("src/smoke-scenarios.js"));

  assert.match(index, /mode: "acceptance"/);
  assert.match(index, /cloudEnabled: false/);
  assert.match(index, /window\.__firebase_config = "\{\}"/);
  assert.match(index, /本機驗收版/);
  assert.doesNotMatch(index, /AIza/);
  assert.doesNotMatch(index, /projectId:\s*"financial-computer"/);
});

test("production deployment guard requires deliberate clean main deployment", () => {
  const valid = {
    confirmation: __productionDeployGuardTestUtils.CONFIRMATION,
    branch: "main",
    head: "abc",
    originMain: "abc",
    trackedChanges: "",
    defaultProject: "financial-computer",
    indexSource: 'mode: "production", cloudEnabled: true, projectId: "financial-computer"',
  };
  assert.deepEqual(evaluateProductionDeploy(valid), []);
  assert.ok(evaluateProductionDeploy({ ...valid, confirmation: "" }).some((error) => /direct firebase deploy is blocked/.test(error)));
  assert.ok(evaluateProductionDeploy({ ...valid, branch: "codex/next" }).some((error) => /requires branch main/.test(error)));
  assert.ok(evaluateProductionDeploy({ ...valid, originMain: "def" }).some((error) => /match origin\/main/.test(error)));
  assert.ok(evaluateProductionDeploy({ ...valid, trackedChanges: " M finance-web/index.html" }).some((error) => /clean tracked/.test(error)));
  assert.ok(evaluateProductionDeploy({ ...valid, defaultProject: "other-project" }).some((error) => /Unexpected Firebase/.test(error)));
  assert.ok(evaluateProductionDeploy({ ...valid, indexSource: 'mode: "acceptance", cloudEnabled: false' }).length >= 2);
});
