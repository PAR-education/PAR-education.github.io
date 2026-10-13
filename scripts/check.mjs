import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
async function files(path) {
  return (
    await Promise.all(
      (await readdir(path, { withFileTypes: true })).map((item) =>
        item.isDirectory()
          ? files(`${path}/${item.name}`)
          : `${path}/${item.name}`,
      ),
    )
  ).flat();
}
for (const file of [
  ...(await files("src")),
  ...(await files("scripts")),
  ...(await files("tests")),
].filter((file) => /\.(m?js)$/.test(file))) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
}
for (const file of ["index.html", "homepage.html", "demo.html"]) {
  const html = await readFile(file, "utf8");
  if (/on(?:click|submit|change)=/.test(html))
    throw new Error(`Inline event handler: ${file}`);
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))
    await readFile(resolve(dirname(file), match[1]));
}
process.stdout.write(
  "All JavaScript parses; HTML asset links resolve; no inline event handlers.\n",
);
