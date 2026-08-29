import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

export function buildFirebaseInvocation({ platform = process.platform, comSpec = process.env.ComSpec } = {}) {
  if (platform === "win32") {
    return {
      command: comSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "firebase.cmd deploy --only hosting"],
    };
  }
  return { command: "firebase", args: ["deploy", "--only", "hosting"] };
}

export function runProductionDeploy({ spawn = spawnSync, platform, comSpec, env = process.env } = {}) {
  const { command, args } = buildFirebaseInvocation({ platform, comSpec });
  const result = spawn(command, args, {
    cwd: projectRoot,
    env: {
      ...env,
      FINANCE_PRODUCTION_DEPLOY_CONFIRM: "I_UNDERSTAND_PRODUCTION",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runProductionDeploy();
}
