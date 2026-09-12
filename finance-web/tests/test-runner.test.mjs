import assert from "node:assert/strict";
import test from "node:test";
import { excludedUnitTests, exclusiveUnitTests, resolveJobs, runJobs, runNode } from "../scripts/run-tests.mjs";

test("worker count is bounded and sequential mode remains available", () => {
  assert.equal(resolveJobs([], 32), 4);
  assert.equal(resolveJobs([], 1), 1);
  assert.equal(resolveJobs(["--jobs=1"]), 1);
  assert.equal(resolveJobs(["--jobs=8"]), 8);
  for (const value of ["0", "-1", "1.5", "9", "", "bad"]) {
    assert.throws(() => resolveJobs(["--jobs=" + value]), /integer from 1 to 8/);
  }
});

test("pool launches no more than its bound and completes each job once", async () => {
  let active = 0;
  let peak = 0;
  const seen = [];
  const gates = [];
  const run = runJobs([0, 1, 2, 3, 4], 2, async (job) => {
    active++;
    peak = Math.max(peak, active);
    seen.push(job);
    await new Promise((resolve) => gates.push(resolve));
    active--;
  });
  assert.deepEqual(seen, [0, 1]);
  while (seen.length < 5 || active) {
    gates.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setImmediate(resolve));
  }
  await run;
  assert.equal(peak, 2);
  assert.deepEqual(seen, [0, 1, 2, 3, 4]);
  await runJobs([], 2, () => assert.fail("empty queue must not launch"));
});

test("failure stops queued jobs and drains in-flight work before rejecting", async () => {
  const seen = [];
  let finishActive;
  let activeFinished = false;
  const run = runJobs([0, 1, 2, 3], 2, async (job) => {
    seen.push(job);
    if (job === 0) throw new Error("expected failure");
    await new Promise((resolve) => { finishActive = resolve; });
    activeFinished = true;
  });
  const rejection = assert.rejects(run, /expected failure/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [0, 1]);
  assert.equal(activeFinished, false);
  finishActive();
  await rejection;
  assert.equal(activeFinished, true);
  assert.deepEqual(seen, [0, 1]);
});

test("node subprocess output stays grouped and failure exit code is preserved", async () => {
  const logs = [];
  await runNode({ args: ["-e", "console.log('out'); console.error('err');"], label: "success" }, { log: (line) => logs.push(line) });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /> success/);
  assert.match(logs[0], /out/);
  assert.match(logs[0], /err/);
  await assert.rejects(
    runNode({ args: ["-e", "process.exit(7)"], label: "failure" }, { log: () => {} }),
    (error) => error.exitCode === 7 && /failure/.test(error.message),
  );
  await assert.rejects(
    runNode({ args: ["-e", ""], label: "spawn-error" }, { cwd: new URL("./missing-runner-directory/", import.meta.url), log: () => {} }),
    (error) => error.exitCode === 1 && /spawn-error/.test(error.message),
  );
});

test("emulators and acceptance stay out of unit discovery; artifact writer is exclusive", () => {
  assert.deepEqual([...excludedUnitTests], [
    "acceptance-isolation.test.mjs",
    "firestore-rules.emulator.test.mjs",
    "functions-emulator.test.mjs",
    "sync-conflict-browser.emulator.test.mjs",
  ]);
  assert.deepEqual([...exclusiveUnitTests], ["security-boundaries.test.js"]);
});
