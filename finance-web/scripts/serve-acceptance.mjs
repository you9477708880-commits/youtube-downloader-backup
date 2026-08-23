import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const root = join(projectRoot, ".acceptance-public");
const portArg = process.argv.find((argument) => argument.startsWith("--port="))?.slice(7) || "4186";
const port = Number(portArg);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${portArg}`);
if (!existsSync(join(root, "index.html"))) throw new Error("Acceptance artifact is missing. Run prepare-acceptance first.");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function resolveRequest(pathname) {
  const decoded = decodeURIComponent(pathname === "/" ? "/index.html" : pathname).replace(/^[/\\]+/, "");
  const candidate = resolve(root, decoded);
  const pathFromRoot = relative(root, candidate);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) return null;
  return candidate;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const filePath = resolveRequest(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(filePath ? 404 : 403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(filePath ? "Not Found" : "Forbidden");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`本機驗收版已啟動：http://127.0.0.1:${port}`);
  console.log("此版本強制使用獨立本機資料，不會連接正式 Firebase。");
});
