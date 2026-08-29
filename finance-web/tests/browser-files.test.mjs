import assert from "node:assert/strict";
import { test } from "node:test";
import { backupFilename, downloadTextFile, readFileAsText } from "../src/services/browser-files.js";

test("browser file helpers generate stable backup names and use File.text when available", async () => {
  const filename = backupFilename("before-clear", () => new Date("2026-08-29T12:34:56.789Z"));
  assert.equal(filename, "finance-backup-before-clear-2026-08-29T12-34-56-789Z.json");
  assert.equal(await readFileAsText({ text: async () => 123 }), "123");
});

test("download helper always revokes its object URL", () => {
  const calls = [];
  const anchor = { click: () => calls.push("click") };
  downloadTextFile({ content: "hello", filename: "data.txt", type: "text/plain" }, {
    doc: { createElement: () => anchor },
    URLClass: {
      createObjectURL: () => { calls.push("create"); return "blob:test"; },
      revokeObjectURL: (url) => calls.push(`revoke:${url}`),
    },
    BlobClass: class FakeBlob {},
  });
  assert.equal(anchor.href, "blob:test");
  assert.equal(anchor.download, "data.txt");
  assert.deepEqual(calls, ["create", "click", "revoke:blob:test"]);
});
