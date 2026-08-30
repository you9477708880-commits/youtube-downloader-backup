import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTestEnvironment } from "./verify-test-environment.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const firebaseCli = resolve(projectRoot, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const artifactRoot = resolve(projectRoot, ".test-artifacts", "emulators", "latest");
const debugLogs = ["firebase-debug.log", "firestore-debug.log", "ui-debug.log"];

export const EMULATOR_MODES = Object.freeze({
  all: {
    only: "auth,firestore,functions",
    testCommand: "node --test --test-concurrency=1 tests/firestore-rules.emulator.test.mjs tests/functions-emulator.test.mjs tests/sync-conflict-browser.emulator.test.mjs",
  },
  rules: {
    only: "firestore",
    testCommand: "node --test tests/firestore-rules.emulator.test.mjs",
  },
  functions: {
    only: "auth,firestore,functions",
    testCommand: "node --test tests/functions-emulator.test.mjs",
  },
});

export function classifyEmulatorFailure(output) {
  const text = String(output || "");
  if (/503[\s\S]{0,200}(Network closed for unknown reason|UNAVAILABLE)|Network closed for unknown reason|UNAVAILABLE:\s*Network closed/i.test(text)) {
    return "infrastructure-firestore-admin-503";
  }
  if (/EADDRINUSE|port .+ already in use|address already in use/i.test(text)) return "infrastructure-port-in-use";
  if (/java.+(?:not found|not recognized)|could not spawn.+java/i.test(text)) return "infrastructure-java-missing";
  if (/supported Chromium-based browser is required|No supported Chrome|browser debug target did not start/i.test(text)) return "infrastructure-browser-missing";
  return "test-or-emulator-failure";
}

export function buildFirebaseArgs(mode) {
  const selected = EMULATOR_MODES[mode];
  if (!selected) throw new Error(`Unknown emulator test mode: ${mode}`);
  return [
    firebaseCli,
    "emulators:exec",
    "--config",
    "firebase.emulator.json",
    "--only",
    selected.only,
    "--project",
    "demo-finance-web",
    selected.testCommand,
  ];
}

function retainChunk(buffer, chunk, limit = 2_000_000) {
  const next = buffer + chunk;
  return next.length > limit ? next.slice(-limit) : next;
}

function saveDiagnostics({ mode, exitCode, classification, output, environment }) {
  mkdirSync(artifactRoot, { recursive: true });
  const copiedLogs = [];
  for (const filename of debugLogs) {
    const source = resolve(projectRoot, filename);
    if (!existsSync(source)) continue;
    copyFileSync(source, resolve(artifactRoot, filename));
    copiedLogs.push(filename);
  }
  writeFileSync(resolve(artifactRoot, "summary.json"), `${JSON.stringify({
    createdAt: new Date().toISOString(),
    mode,
    exitCode,
    classification,
    environment: environment.actual,
    copiedLogs,
  }, null, 2)}\n`);
  writeFileSync(resolve(artifactRoot, "runner-output.txt"), output);
}

export async function runEmulatorTests(mode = "all") {
  const environment = verifyTestEnvironment();
  const args = buildFirebaseArgs(mode);
  let combinedOutput = "";
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: { ...process.env, GCLOUD_PROJECT: "demo-finance-web" },
    stdio: ["inherit", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    process.stdout.write(text);
    combinedOutput = retainChunk(combinedOutput, text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    process.stderr.write(text);
    combinedOutput = retainChunk(combinedOutput, text);
  });
  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise(code ?? 1));
  });
  if (exitCode !== 0) {
    for (const filename of debugLogs) {
      const path = resolve(projectRoot, filename);
      if (existsSync(path)) combinedOutput = retainChunk(combinedOutput, readFileSync(path, "utf8"));
    }
    const classification = classifyEmulatorFailure(combinedOutput);
    saveDiagnostics({ mode, exitCode, classification, output: combinedOutput, environment });
    console.error(
      `\nEmulator verification failed (${classification}). ` +
      "Diagnostics were saved under .test-artifacts/emulators/latest.",
    );
  }
  return exitCode;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runEmulatorTests(process.argv[2] || "all");
  } catch (error) {
    console.error(`Emulator verification could not start: ${error.message}`);
    process.exitCode = 2;
  }
}
