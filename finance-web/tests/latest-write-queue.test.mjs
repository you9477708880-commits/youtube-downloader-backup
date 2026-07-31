import assert from "node:assert/strict";
import { createLatestWriteQueue } from "../src/services/latest-write-queue.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function testSerializesAndCoalescesLatestState() {
  let currentState = { value: 1 };
  let concurrentWrites = 0;
  let maxConcurrentWrites = 0;
  const writes = [];
  const gates = [];
  const lifecycle = [];

  const queue = createLatestWriteQueue({
    write: async (state) => {
      concurrentWrites += 1;
      maxConcurrentWrites = Math.max(maxConcurrentWrites, concurrentWrites);
      writes.push(state);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      concurrentWrites -= 1;
    },
    onStart: () => lifecycle.push("start"),
    onIdle: (error) => lifecycle.push(error ? "error" : "idle"),
  });

  const firstSave = queue.enqueue({ ...currentState });
  await flushMicrotasks();
  assert.deepEqual(writes, [{ value: 1 }]);

  currentState = { value: 2 };
  const secondSave = queue.enqueue({ ...currentState });
  currentState = { value: 3 };
  const thirdSave = queue.enqueue({ ...currentState });

  gates[0].resolve();
  await flushMicrotasks();
  assert.deepEqual(writes, [{ value: 1 }, { value: 3 }]);
  assert.equal(maxConcurrentWrites, 1);

  gates[1].resolve();
  await Promise.all([firstSave, secondSave, thirdSave]);
  assert.deepEqual(lifecycle, ["start", "idle"]);
  assert.equal(queue.isActive(), false);
}

async function testFailureCanRecoverWithLatestState() {
  let currentState = { value: "failed" };
  const writes = [];
  let shouldFail = true;

  const queue = createLatestWriteQueue({
    write: (state) => {
      writes.push(state);
      if (shouldFail) throw new Error("simulated-write-failure");
      return Promise.resolve();
    },
  });

  await assert.rejects(queue.enqueue({ ...currentState }), /simulated-write-failure/);

  shouldFail = false;
  currentState = { value: "recovered" };
  await queue.enqueue({ ...currentState });
  assert.deepEqual(writes, [{ value: "failed" }, { value: "recovered" }]);
}

async function testDestroyedQueueDoesNotStartNewWrites() {
  let writeCount = 0;
  const queue = createLatestWriteQueue({
    write: async () => {
      writeCount += 1;
    },
  });

  queue.destroy();
  await queue.enqueue({ value: 1 });
  assert.equal(writeCount, 0);
}

async function testDestroyDropsPendingLatestWrite() {
  const writes = [];
  const gate = deferred();
  const queue = createLatestWriteQueue({
    write: async (state) => {
      writes.push(state);
      await gate.promise;
    },
  });

  const activeSave = queue.enqueue({ account: "A", value: 1 });
  await flushMicrotasks();
  queue.enqueue({ account: "A", value: 2 });
  queue.destroy();
  gate.resolve();
  await activeSave;

  assert.deepEqual(writes, [{ account: "A", value: 1 }]);
}

await testSerializesAndCoalescesLatestState();
await testFailureCanRecoverWithLatestState();
await testDestroyedQueueDoesNotStartNewWrites();
await testDestroyDropsPendingLatestWrite();
console.log("Latest write queue tests passed");
