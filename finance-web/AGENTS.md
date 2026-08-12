# Finance Web Codex Working Rules

這份文件是給 Codex / AI coding agent 的專案工作規則。目標是避免在不確定時亂猜、亂改 UI 或破壞帳務資料模型。

This file defines project-specific rules for Codex / AI coding agents. The goal is to prevent speculative edits, accidental UI churn, and accounting-model regressions.

## 1. Project Facts

- This is a vanilla HTML / CSS / JavaScript project. It is not React, Vue, or a framework app.
- The deployed app root is `D:\桌面\音樂下載\finance-web`.
- Main source files are under `src/app`, `src/domain`, `src/views`, `src/services`, `src/state`, and `src/utils`.
- The product is a personal finance operating system, not only a bookkeeping page.
- Core features include ledger, budgets, large-expense funds, balance sheet, retirement estimates, local storage, Firebase Google sign-in, Firestore sync, JSON import/export, AndroMoney CSV import/export, and PWA.
- The EPUB file in the project root is a user-provided reference file. Do not add it to Git unless the user explicitly asks.

## 2. Source-Of-Truth Rules

- `txs` is the source of truth for actual transactions.
- `sinkingFunds.events` is the source of truth for large-expense fund events.
- `monthlyContribution` is budget planning, not an account transfer.
- `topup` means extra money added to a fund and reduces current-month free-to-use budget.
- `spend` means fund balance was used.
- A fund-covered expense must not be counted again as current-month living expense.
- The app now uses large-expense preparation / fund logic. Do not reintroduce the old after-the-fact spreading logic as the main model.
- Retirement custom-parameter projection and the 4% rule reference are separate concepts. Do not merge them into one warning model.
- Local / cloud data is not automatically merged. If local and cloud data both exist and differ, the user must choose overwrite direction.

## 3. Required Work Sequence

Before editing files:

1. Read this file, then read the relevant docs:
   - `docs/accounting-rules.md`
   - `docs/data-model.md`
   - `docs/report-traceability.md`
   - `docs/roadmap.md`
2. Inspect the current code that owns the behavior.
3. Check `git status` and preserve user changes.
4. State the current behavior, the intended behavior, and the exact files likely to change.
5. If the request affects accounting rules, sync rules, import/export, or major UI layout, ask for clarification when any rule is ambiguous.

During implementation:

- Make surgical changes only.
- Reuse existing modules and helper functions.
- Do not add a new framework or dependency without explicit approval.
- Do not refactor unrelated code.
- Do not change neighboring formatting just because it looks nicer.
- Do not silently change mobile UI, desktop layout, or visual density unless the request is specifically about UI layout.

After implementation:

- Run the smallest meaningful tests first, then broader checks if the change touches shared behavior.
- Summarize what changed, what was tested, and what remains unverified.
- Commit locally when a coherent unit is complete.
- Do not push to GitHub or deploy Firebase Hosting unless the user explicitly asks.

## 4. UI And Screenshot Safety

- Do not treat headless or plugin screenshots as authoritative when they disagree with user real-device checks.
- If a browser plugin reports mobile overflow, verify with project smoke tests, direct DOM/CSS inspection, or user confirmation before changing layout.
- Do not make broad CSS changes based only on one screenshot.
- If editing UI, preserve existing mobile behavior unless the user asks to change mobile layout.
- Prefer small, targeted fixes: text wrapping, stable dimensions, safe overflow handling, or a single affected component.
- Avoid turning operational pages into landing pages or decorative card-heavy layouts.

## 5. Agent Workflow For Larger Changes

For small bug fixes, one agent can implement directly after inspection.

For larger changes, emulate this sequence:

1. **Researcher**: read relevant code and docs only. No edits. Output current behavior, related files, risks, and tests.
2. **Story / Scope**: define the user-visible outcome, acceptance criteria, out-of-scope items, and unclear questions.
3. **Spec**: list data-model changes, UI changes, files to edit, tests to add, and risks.
4. **Builder**: edit only the approved files and scope.
5. **Verifier**: run tests, inspect diff, check for out-of-scope changes, and report gaps.

Human approval is required before moving from research/spec into implementation when:

- A data model changes.
- Accounting formulas change.
- Local/cloud sync behavior changes.
- Import/export semantics change.
- A broad UI layout change is proposed.
- A tool or screenshot gives evidence that conflicts with user real-device observations.

Sub-agent usage:

- When the tool environment supports it and the task can be split cleanly, prefer assigning read-only inspection, verification, or disjoint file-scope work to sub-agents.
- The main agent remains responsible for final judgment, reviewing diffs, integrating results, and reporting to the user.
- Sub-agents must not push to GitHub, deploy Firebase Hosting, or expand the requested scope.
- Close sub-agents as soon as their work is complete or no longer needed, so unused side workspaces do not remain open.

## 6. Testing Commands

Complete one-command suite:

```powershell
npm test
```

This runs syntax checks, existing unit/integration tests, Firestore and Functions Emulator tests against `demo-finance-web`, and all 13 UI smoke scenarios. It must not use a production Firebase project ID.

Syntax check:

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Domain tests:

```powershell
node .\tests\domain.test.mjs
```

Security boundary tests:

```powershell
node .\tests\security-boundaries.test.js
```

Cloud sync write queue tests:

```powershell
node .\tests\latest-write-queue.test.mjs
node .\tests\storage-cloud.test.mjs
node .\tests\storage-local.test.mjs
node .\tests\record-codec.test.mjs
node .\tests\storage-cloud-records.test.mjs
```

Emulator tests:

```powershell
npm run test:rules
npm run test:functions
npm run test:emulators
```

Project-local smoke runner:

```powershell
npm run test:smoke
```

Diff hygiene:

```powershell
git diff --check
```

## 7. Git And Deployment Rules

- Frequent local commits are acceptable and useful.
- Frequent remote pushes are not required.
- Push only after a coherent batch is complete and tested, or when the user asks.
- Firebase Hosting deployment is separate from GitHub push.
- Deploy only when the user asks and after final checks pass.
- Never add the EPUB reference file unless explicitly requested.

## 8. When To Stop And Ask

Stop and ask the user before proceeding if:

- The rule would decide where money is counted.
- A transaction, fund event, budget, or balance-sheet number could be double-counted or omitted.
- The implementation would overwrite local or cloud data.
- A UI tool suggests a layout change but real-device evidence does not confirm it.
- The change requires replacing existing architecture.
- The requested behavior conflicts with `docs/accounting-rules.md` or `docs/data-model.md`.
