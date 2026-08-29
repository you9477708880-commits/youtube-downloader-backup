import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFirebaseInvocation, runProductionDeploy } from "../scripts/deploy-production.mjs";

test("production deploy uses cmd.exe for the Firebase command shim on Windows", () => {
  assert.deepEqual(buildFirebaseInvocation({ platform: "win32", comSpec: "C:\\Windows\\System32\\cmd.exe" }), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "firebase.cmd deploy --only hosting"],
  });
  assert.deepEqual(buildFirebaseInvocation({ platform: "linux" }), {
    command: "firebase",
    args: ["deploy", "--only", "hosting"],
  });
});

test("production deploy passes only Hosting and the explicit guard confirmation", () => {
  let observed;
  const status = runProductionDeploy({
    platform: "win32",
    comSpec: "cmd.exe",
    env: { EXISTING_VALUE: "kept" },
    spawn(command, args, options) {
      observed = { command, args, options };
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.equal(observed.command, "cmd.exe");
  assert.deepEqual(observed.args, ["/d", "/s", "/c", "firebase.cmd deploy --only hosting"]);
  assert.equal(observed.options.env.EXISTING_VALUE, "kept");
  assert.equal(observed.options.env.FINANCE_PRODUCTION_DEPLOY_CONFIRM, "I_UNDERSTAND_PRODUCTION");
});
