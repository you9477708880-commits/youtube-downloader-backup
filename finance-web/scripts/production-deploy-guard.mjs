import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const CONFIRMATION = "I_UNDERSTAND_PRODUCTION";

export function evaluateProductionDeploy({ confirmation, branch, head, originMain, trackedChanges, defaultProject, indexSource }) {
  const errors = [];
  if (confirmation !== CONFIRMATION) errors.push("Use npm run deploy:hosting:production; direct firebase deploy is blocked.");
  if (branch !== "main") errors.push(`Production deploy requires branch main; current branch is ${branch || "detached"}.`);
  if (!head || head !== originMain) errors.push("Production deploy requires HEAD to exactly match origin/main.");
  if (String(trackedChanges || "").trim()) errors.push("Production deploy requires a clean tracked finance-web worktree.");
  if (defaultProject !== "financial-computer") errors.push(`Unexpected Firebase default project: ${defaultProject || "missing"}.`);
  if (!/mode:\s*"production"/.test(indexSource) || !/cloudEnabled:\s*true/.test(indexSource)) {
    errors.push("Production index runtime is not explicitly cloud-enabled production mode.");
  }
  if (!/projectId:\s*"financial-computer"/.test(indexSource)) {
    errors.push("Production index does not target the expected Firebase project.");
  }
  return errors;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function verifyProductionDeploy({ projectRoot, env = process.env }) {
  const firebaserc = JSON.parse(readFileSync(resolve(projectRoot, ".firebaserc"), "utf8"));
  const indexSource = readFileSync(resolve(projectRoot, "index.html"), "utf8");
  const errors = evaluateProductionDeploy({
    confirmation: env.FINANCE_PRODUCTION_DEPLOY_CONFIRM,
    branch: git(["branch", "--show-current"], projectRoot),
    head: git(["rev-parse", "HEAD"], projectRoot),
    originMain: git(["rev-parse", "origin/main"], projectRoot),
    trackedChanges: git(["status", "--porcelain", "--untracked-files=no", "--", "."], projectRoot),
    defaultProject: firebaserc.projects?.default,
    indexSource,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return true;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    verifyProductionDeploy({ projectRoot: resolve(import.meta.dirname, "..") });
    console.log("Production deploy guard passed.");
  } catch (error) {
    console.error(`Production deploy blocked:\n${error.message}`);
    process.exitCode = 1;
  }
}

export const __productionDeployGuardTestUtils = { CONFIRMATION };
