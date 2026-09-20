/**
 * Puts MapLibre's worker where the browser can load it: `public/maplibre/`.
 *
 * MapLibre GL JS 6 is ESM-only and runs its tile pipeline in a separate module
 * worker (`maplibre-gl-worker.mjs`, which imports `./maplibre-gl-shared.mjs`).
 * It finds that file from `import.meta.url` at runtime — a URL a bundler does
 * not preserve: under Next/Turbopack it resolves to the page itself, the worker
 * loads HTML, dies at once, and the map shows pins and attribution over a blank
 * canvas (TRA-181). The canvas therefore points `setWorkerUrl` at
 * `/maplibre/maplibre-gl-worker.mjs`, and this script keeps that path in step
 * with the installed version: it runs before `next dev` and `next build`
 * (`predev`, `prebuild`, `pretest:e2e*` in package.json). The folder is
 * gitignored; the names are kept verbatim so the worker's relative import works.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "maplibre-gl", "dist");
const target = join(root, "public", "maplibre");

const files = [
  "maplibre-gl-worker.mjs",
  "maplibre-gl-worker.mjs.map",
  "maplibre-gl-shared.mjs",
  "maplibre-gl-shared.mjs.map",
];

if (!existsSync(join(source, files[0]))) {
  console.error(`copy-maplibre-worker: ${join(source, files[0])} is missing — run npm install first`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });
for (const name of files) {
  const from = join(source, name);
  if (!existsSync(from)) continue; // source maps are optional
  copyFileSync(from, join(target, name));
}

const { version } = JSON.parse(
  readFileSync(join(root, "node_modules", "maplibre-gl", "package.json"), "utf8")
);
console.log(`copy-maplibre-worker: maplibre-gl ${version} worker → public/maplibre/`);
