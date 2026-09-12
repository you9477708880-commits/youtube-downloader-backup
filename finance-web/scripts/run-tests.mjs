import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const syntaxRoots = ["src", "tests", "scripts"];
export const excludedUnitTests = new Set([
  "acceptance-isolation.test.mjs",
  "firestore-rules.emulator.test.mjs",
  "functions-emulator.test.mjs",
  "sync-conflict-browser.emulator.test.mjs",
]);
// This test builds and removes the shared .firebase-public directory.
export const exclusiveUnitTests = new Set(["security-boundaries.test.js"]);

export function resolveJobs(args = [], cpuCount = availableParallelism()) {
  const option = args.find((argument) => argument.startsWith("--jobs="));
  const count = option ? Number(option.slice(7)) : Math.min(4, Math.max(1, cpuCount));
  if (!Number.isInteger(count) || count < 1 || count > 8) {
    throw new Error("--jobs must be an integer from 1 to 8");
  }
  return count;
}

export function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(path);
    return [".js", ".mjs"].includes(extname(entry.name)) ? [path] : [];
  });
}

// Stop launching on failure, but drain active work before moving on or exiting.
export async function runJobs(jobs, concurrency, worker) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("concurrency must be an integer from 1 to 8");
  }
  let next = 0;
  let failure = null;
  const consume = async () => {
    while (!failure && next < jobs.length) {
      const job = jobs[next++];
      try {
        await worker(job);
      } catch (error) {
        failure ||= error instanceof Error ? error : new Error(String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, consume));
  if (failure) throw failure;
}

export function runNode({ args, label }, { cwd = projectRoot, log = console.log } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    let spawnError = null;
    child.once("error", (error) => { spawnError = error; });
    child.once("close", (code, signal) => {
      // Keep each file's output together instead of interleaving TAP streams.
      const output = Buffer.concat(chunks).toString("utf8").trimEnd();
      log("\n> " + label + (output ? "\n" + output : ""));
      if (spawnError || code !== 0) {
        const error = new Error(label + " failed (" + (spawnError?.message || signal || code) + ")");
        error.exitCode = !spawnError && code > 0 ? code : 1;
        reject(error);
      } else resolveRun();
    });
  });
}

export async function main(args = process.argv.slice(2)) {
  const concurrency = resolveJobs(args);
  const startedAt = performance.now();
  const testFiles = readdirSync(join(projectRoot, "tests"))
    .filter((name) => /\.test\.(mjs|js)$/.test(name) && !excludedUnitTests.has(name))
    .sort();
  const syntaxJobs = syntaxRoots.flatMap((directory) => collectJavaScriptFiles(join(projectRoot, directory)))
    .map((path) => ({ args: ["--check", path], label: "syntax " + relative(projectRoot, path) }));
  syntaxJobs.push({ args: ["--check", "functions/index.js"], label: "syntax functions/index.js" });
  console.log("Running syntax and unit tests with up to " + concurrency + " workers.");
  await runJobs(syntaxJobs, concurrency, runNode);

  const toJob = (name) => ({ args: ["tests/" + name], label: "tests/" + name });
  await runJobs(testFiles.filter((name) => !exclusiveUnitTests.has(name)).map(toJob), concurrency, runNode);
  await runJobs(testFiles.filter((name) => exclusiveUnitTests.has(name)).map(toJob), 1, runNode);
  console.log("\nAll unit and syntax tests passed (" + Math.round(performance.now() - startedAt) + " ms).");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  });
}
