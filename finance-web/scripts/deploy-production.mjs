import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const firebaseCommand = process.platform === "win32" ? "firebase.cmd" : "firebase";
const result = spawnSync(firebaseCommand, ["deploy", "--only", "hosting"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    FINANCE_PRODUCTION_DEPLOY_CONFIRM: "I_UNDERSTAND_PRODUCTION",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
