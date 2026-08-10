const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".firebase-public");
const rootFiles = ["index.html", "404.html"];
const publicDirectories = ["assets", "src", "admin"];
const excludedRelativePaths = new Set(["src/smoke-scenarios.js"]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertSafeOutputPath() {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe Hosting output path: ${outputRoot}`);
  }
}

function shouldCopy(sourcePath) {
  const relative = toPosix(path.relative(projectRoot, sourcePath));
  return !excludedRelativePaths.has(relative);
}

function copyRequired(sourceRelativePath) {
  const source = path.join(projectRoot, sourceRelativePath);
  const destination = path.join(outputRoot, sourceRelativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Hosting source: ${sourceRelativePath}`);
  }
  fs.cpSync(source, destination, { recursive: true, filter: shouldCopy });
}

function enforceExcludedOutputs() {
  excludedRelativePaths.forEach((relativePath) => {
    const destination = path.join(outputRoot, ...relativePath.split("/"));
    fs.rmSync(destination, { recursive: true, force: true });
    if (fs.existsSync(destination)) {
      throw new Error(`Forbidden Hosting output remains: ${relativePath}`);
    }
  });
}

function prepareHostingDirectory() {
  assertSafeOutputPath();
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  rootFiles.forEach(copyRequired);
  publicDirectories.forEach(copyRequired);
  enforceExcludedOutputs();

  console.log(`Prepared Firebase Hosting files in ${outputRoot}`);
}

prepareHostingDirectory();
