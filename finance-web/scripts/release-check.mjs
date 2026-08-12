import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(projectRoot, ".firebase-public");
const remoteUrl = process.argv.find((argument) => argument.startsWith("--url="))?.slice(6).replace(/\/$/, "");

function toPosix(value) {
  return value.split(sep).join("/");
}

function listFiles(directory = outputRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [toPosix(relative(outputRoot, fullPath))];
  });
}

function assertInsideOutput(candidate, source) {
  const relativePath = relative(outputRoot, candidate);
  assert.ok(relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath), `${source} escapes the Hosting artifact`);
}

function resolveReference(sourceFile, reference) {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(reference)) return null;
  const cleanReference = reference.split(/[?#]/, 1)[0];
  if (!cleanReference) return null;
  return cleanReference.startsWith("/")
    ? resolve(outputRoot, `.${cleanReference}`)
    : resolve(join(outputRoot, sourceFile), "..", cleanReference);
}

function assertReferenceExists(sourceFile, reference) {
  const target = resolveReference(sourceFile, reference);
  if (!target) return;
  assertInsideOutput(target, `${sourceFile}: ${reference}`);
  assert.ok(listFilesCache.has(toPosix(relative(outputRoot, target))), `${sourceFile} references missing artifact file: ${reference}`);
}

function checkArtifact() {
  const prepare = spawnSync(process.execPath, ["scripts/prepare-hosting.js"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(prepare.status, 0, prepare.stderr || prepare.stdout);

  const files = listFiles().sort();
  listFilesCache = new Set(files);
  ["index.html", "404.html", "manifest.webmanifest", "sw.js", "src/main.js", "admin/index.html"].forEach((file) => {
    assert.ok(listFilesCache.has(file), `Missing Hosting artifact file: ${file}`);
  });

  const allowedTopLevel = new Set(["index.html", "404.html", "manifest.webmanifest", "sw.js", "assets", "src", "admin"]);
  files.forEach((file) => assert.ok(allowedTopLevel.has(file.split("/")[0]), `Unexpected Hosting artifact file: ${file}`));

  const forbiddenPatterns = [/^docs\//, /^tests\//, /^functions\//, /smoke-scenarios\.js$/, /\.md$/i, /\.epub$/i, /firestore\.rules$/];
  files.forEach((file) => forbiddenPatterns.forEach((pattern) => assert.doesNotMatch(file, pattern, `Forbidden Hosting artifact file: ${file}`)));

  files.filter((file) => extname(file) === ".html").forEach((file) => {
    const source = readFileSync(join(outputRoot, file), "utf8");
    for (const match of source.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)) {
      assertReferenceExists(file, match[1]);
    }
  });

  files.filter((file) => extname(file) === ".js").forEach((file) => {
    const source = readFileSync(join(outputRoot, file), "utf8");
    const staticImportPattern = /(?:^|\n)\s*import\s+(?:[^"'();]*?\s+from\s*)?["']([^"']+)["']/g;
    const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']/g;
    for (const pattern of [staticImportPattern, dynamicImportPattern]) {
      for (const match of source.matchAll(pattern)) assertReferenceExists(file, match[1]);
    }
  });

  const manifest = JSON.parse(readFileSync(join(outputRoot, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");

  const pwaSource = readFileSync(join(outputRoot, "src/services/pwa.js"), "utf8");
  assert.match(pwaSource, /\.register\(new URL\("\.\.\/\.\.\/sw\.js", import\.meta\.url\)/);
  assert.doesNotMatch(pwaSource, /serviceWorker\s*\.register\(URL\.createObjectURL|new Blob\(\[swCode\]/);

  console.log(`Release artifact check passed (${files.length} files).`);
}

async function fetchChecked(pathname, expectedStatus = 200) {
  const response = await fetch(`${remoteUrl}${pathname}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "finance-web-release-check" },
  });
  assert.equal(response.status, expectedStatus, `${pathname} returned HTTP ${response.status}`);
  return response;
}

async function checkRemote() {
  assert.match(remoteUrl, /^https?:\/\//, "--url must be an absolute HTTP(S) origin");
  const home = await fetchChecked("/");
  const homeText = await home.text();
  assert.match(homeText, /src="\.\/src\/main\.js"/);

  for (const [header, expected] of [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
  ]) {
    assert.equal(home.headers.get(header), expected, `Missing or unexpected ${header} header`);
  }
  assert.match(home.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);

  const serviceWorker = await fetchChecked("/sw.js");
  assert.match(serviceWorker.headers.get("cache-control") || "", /no-cache/);

  await Promise.all([
    fetchChecked("/src/main.js"),
    fetchChecked("/src/services/pwa.js"),
    fetchChecked("/manifest.webmanifest"),
    fetchChecked("/src/smoke-scenarios.js", 404),
  ]);
  console.log(`Remote release health check passed: ${remoteUrl}`);
}

let listFilesCache = new Set();
checkArtifact();
if (remoteUrl) await checkRemote();
