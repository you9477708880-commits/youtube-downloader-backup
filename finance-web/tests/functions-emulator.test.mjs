import assert from "node:assert/strict";
import { test } from "node:test";

const baseUrl = "http://127.0.0.1:5001/demo-finance-web/asia-east1/adminApi";

test("direct Functions emulator endpoint handles OPTIONS", async () => {
  const response = await fetch(`${baseUrl}/api/admin/profile`, { method: "OPTIONS" });
  assert.equal(response.status, 204);
});

test("Functions emulator rejects an unauthenticated admin request", async () => {
  const response = await fetch(`${baseUrl}/api/admin/profile`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "missing-token" });
});
