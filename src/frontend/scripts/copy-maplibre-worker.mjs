/**
 * Puts MapLibre's worker where the browser can load it: `public/maplibre/`.
 *
 * MapLibre GL JS 6 is ESM-only and runs its tile pipeline in a separate module
 * worker (`maplibre-gl-worker.mjs`, which imports `./maplibre-gl-shared.mjs`).
 * It finds that file from `import.meta.url` at runtime — a URL a bundler does
 * not preserve: under Next/Turbopack it resolves to the page itself, the worker
 * loads HTML, dies at once, and the map shows pins and attribution over a blank
 * canvas (TRA-181). The canvas therefore points `setWorkerUrl` at
 * `/maplibre/maplibre-gl-worker.js`, and this script keeps that path in step
 * with the installed version: it runs before `next dev` and `next build`
 * (`predev`, `prebuild`, `pretest:e2e*` in package.json). The folder is
 * gitignored.
 *
 * The copies are `.js`, not `.mjs`: a module worker is refused unless the
 * server answers with a JavaScript MIME type, and `.mjs` is not one everywhere
 * (nginx's stock `mime.types` maps only `js`, so the Compose stack served it as
 * `application/octet-stream`). The worker's one relative import and both
 * `sourceMappingURL` comments are rewritten to the new names; anything else
 * relative in a future MapLibre release stops the copy loudly.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "maplibre-gl", "dist");
const target = join(root, "public", "maplibre");

/** `dist` name → `public/maplibre` name. */
const files = {
  "maplibre-gl-worker.mjs": "maplibre-gl-worker.js",
  "maplibre-gl-shared.mjs": "maplibre-gl-shared.js",
};

function fail(message) {
  console.error(`copy-maplibre-worker: ${message}`);
  process.exit(1);
}

if (!existsSync(join(source, "maplibre-gl-worker.mjs"))) {
  fail(`${join(source, "maplibre-gl-worker.mjs")} is missing — run npm install first`);
}

/** Every `./x.mjs` the module refers to must be one of the files copied here. */
function rewrite(code, name) {
  const specifiers = new Set(code.match(/\.\/[\w.-]+\.mjs/g) ?? []);
  for (const specifier of specifiers) {
    const from = specifier.slice(2);
    const to = files[from];
    if (!to) fail(`${name} refers to ${specifier}, which this script does not copy`);
    code = code.replaceAll(specifier, `./${to}`);
  }
  for (const [from, to] of Object.entries(files)) {
    code = code.replaceAll(`sourceMappingURL=${from}.map`, `sourceMappingURL=${to}.map`);
  }
  return code;
}

mkdirSync(target, { recursive: true });
for (const [from, to] of Object.entries(files)) {
  const code = readFileSync(join(source, from), "utf8");
  writeFileSync(join(target, to), rewrite(code, from));
  const map = join(source, `${from}.map`);
  if (existsSync(map)) writeFileSync(join(target, `${to}.map`), readFileSync(map));
}

const { version } = JSON.parse(
  readFileSync(join(root, "node_modules", "maplibre-gl", "package.json"), "utf8")
);
console.log(`copy-maplibre-worker: maplibre-gl ${version} worker → public/maplibre/`);
