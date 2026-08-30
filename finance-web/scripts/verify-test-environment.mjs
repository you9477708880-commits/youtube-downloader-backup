import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_TEST_ENVIRONMENT = Object.freeze({
  node: "20.20.2",
  javaMajor: 21,
  firebaseTools: "15.22.4",
});

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function cleanVersion(value) {
  return String(value || "").trim().replace(/^v/, "");
}

export function parseJavaMajor(output) {
  const match = String(output || "").match(/version\s+"(?:1\.)?(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function evaluateTestEnvironment({ nodeVersion, javaOutput, firebaseToolsVersion, firebaseCliExists }) {
  const errors = [];
  const actualNode = cleanVersion(nodeVersion);
  const javaMajor = parseJavaMajor(javaOutput);
  const actualFirebase = cleanVersion(firebaseToolsVersion);

  if (actualNode !== EXPECTED_TEST_ENVIRONMENT.node) {
    errors.push(`Node must be ${EXPECTED_TEST_ENVIRONMENT.node}; found ${actualNode || "unknown"}.`);
  }
  if (javaMajor !== EXPECTED_TEST_ENVIRONMENT.javaMajor) {
    errors.push(`Java must be major ${EXPECTED_TEST_ENVIRONMENT.javaMajor}; found ${javaMajor ?? "unknown"}.`);
  }
  if (actualFirebase !== EXPECTED_TEST_ENVIRONMENT.firebaseTools) {
    errors.push(`Project-local firebase-tools must be ${EXPECTED_TEST_ENVIRONMENT.firebaseTools}; found ${actualFirebase || "missing"}.`);
  }
  if (!firebaseCliExists) errors.push("Project-local Firebase CLI entry is missing; run npm ci.");

  return {
    ok: errors.length === 0,
    errors,
    actual: {
      node: actualNode || "unknown",
      javaMajor,
      firebaseTools: actualFirebase || "missing",
    },
  };
}

export function collectTestEnvironment({ root = projectRoot } = {}) {
  const java = spawnSync("java", ["-version"], { encoding: "utf8" });
  const javaOutput = `${java.stdout || ""}\n${java.stderr || ""}`;
  const firebasePackagePath = resolve(root, "node_modules", "firebase-tools", "package.json");
  const firebaseCliPath = resolve(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
  let firebaseToolsVersion = "";
  if (existsSync(firebasePackagePath)) {
    firebaseToolsVersion = JSON.parse(readFileSync(firebasePackagePath, "utf8")).version;
  }
  return evaluateTestEnvironment({
    nodeVersion: process.version,
    javaOutput,
    firebaseToolsVersion,
    firebaseCliExists: existsSync(firebaseCliPath),
  });
}

export function verifyTestEnvironment(options) {
  const result = collectTestEnvironment(options);
  if (!result.ok) {
    const detail = result.errors.map((error) => `- ${error}`).join("\n");
    throw new Error(
      `Test environment does not match the repository contract:\n${detail}\n` +
      "Use the Node version in .nvmrc, Temurin Java 21, then run npm ci. " +
      "For a quick code-only check on another Node version, use npm run test:fast.",
    );
  }
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyTestEnvironment();
    console.log(
      `Test environment verified: Node ${result.actual.node}, Java ${result.actual.javaMajor}, ` +
      `firebase-tools ${result.actual.firebaseTools}.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
