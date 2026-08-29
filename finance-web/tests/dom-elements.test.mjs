import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { collectDom } from "../src/app/dom-elements.js";

test("bootstrap DOM map references only elements present in index.html", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const doc = { getElementById: (id) => ids.has(id) ? { id } : null };
  const elements = collectDom(doc);
  const missing = Object.entries(elements)
    .filter(([key, value]) => key !== "root" && value === null)
    .map(([key]) => key);
  assert.deepEqual(missing, []);
});
