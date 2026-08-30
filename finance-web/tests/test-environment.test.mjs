import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_TEST_ENVIRONMENT,
  evaluateTestEnvironment,
  parseJavaMajor,
} from "../scripts/verify-test-environment.mjs";
import { buildFirebaseArgs, classifyEmulatorFailure } from "../scripts/run-emulator-tests.mjs";
import browserCandidateModule from "./browser-candidates.js";

const { browserCandidates } = browserCandidateModule;

function validEnvironment(overrides = {}) {
  return {
    nodeVersion: `v${EXPECTED_TEST_ENVIRONMENT.node}`,
    javaOutput: `openjdk version "${EXPECTED_TEST_ENVIRONMENT.javaMajor}.0.12"`,
    firebaseToolsVersion: EXPECTED_TEST_ENVIRONMENT.firebaseTools,
    firebaseCliExists: true,
    ...overrides,
  };
}

test("test environment contract accepts only the pinned toolchain", () => {
  assert.equal(evaluateTestEnvironment(validEnvironment()).ok, true);
  assert.match(evaluateTestEnvironment(validEnvironment({ nodeVersion: "v24.15.0" })).errors.join("\n"), /Node must be/);
  assert.match(evaluateTestEnvironment(validEnvironment({ javaOutput: 'openjdk version "17.0.1"' })).errors.join("\n"), /Java must be/);
  assert.match(evaluateTestEnvironment(validEnvironment({ firebaseToolsVersion: "15.15.0" })).errors.join("\n"), /firebase-tools/);
  assert.equal(parseJavaMajor('openjdk version "21.0.12"'), 21);
});

test("emulator runner uses the project-local CLI and demo project", () => {
  const args = buildFirebaseArgs("all");
  assert.match(args[0], /node_modules[\\/]firebase-tools[\\/]lib[\\/]bin[\\/]firebase\.js$/);
  assert.ok(args.includes("demo-finance-web"));
  assert.ok(args.includes("auth,firestore,functions"));
  assert.throws(() => buildFirebaseArgs("unknown"), /Unknown emulator test mode/);
});

test("emulator failures distinguish infrastructure 503 from test failures", () => {
  assert.equal(
    classifyEmulatorFailure("HTTP Error: 503 UNAVAILABLE: Network closed for unknown reason"),
    "infrastructure-firestore-admin-503",
  );
  assert.equal(classifyEmulatorFailure("EADDRINUSE: address already in use"), "infrastructure-port-in-use");
  assert.equal(classifyEmulatorFailure("AssertionError: expected 2 to equal 1"), "test-or-emulator-failure");
});

test("browser candidates cover configured paths and fixed Linux runner paths", () => {
  const configured = browserCandidates({ platform: "linux", env: { CHROME_PATH: "/custom/chrome" } });
  assert.equal(configured[0], "/custom/chrome");
  assert.ok(configured.includes("/usr/bin/google-chrome"));
  assert.equal(new Set(configured).size, configured.length);
});
