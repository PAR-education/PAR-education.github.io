import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(".");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      // The same app can be tested below a GitHub Pages project path.
      if (pathname.startsWith("/par/")) pathname = pathname.slice(4);
      const path = resolve(
        root,
        "." + pathname,
        pathname.endsWith("/") ? "index.html" : "",
      );
      if (
        !path.startsWith(root + sep) ||
        /(?:^|[\\/])\.[^\\/]/.test(path.slice(root.length)) ||
        path.includes("node_modules")
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!(await stat(path)).isFile()) throw new Error("Not a file");
      const contents = await readFile(path);
      res.writeHead(200, {
        "Content-Type": types[extname(path)] || "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(contents);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    process.stdout.write(
      "Local: http://127.0.0.1:4173\nSubdirectory: http://127.0.0.1:4173/par/\n",
    ),
  );
