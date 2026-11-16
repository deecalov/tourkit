import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Assembles the static site for GitHub Pages into `site/`:
 *   /            — the landing page (asset paths rewritten to ./dist/)
 *   /dist/       — library build consumed by the landing
 *   /demo/       — the built demo playground (vite build demo --base ./)
 * Markdown links that only make sense inside the repository are rewritten
 * to GitHub URLs. Run after `npm run build` and the demo build.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = resolve(root, "site");
const REPO = "https://github.com/deecalov/tourkit/blob/main";

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

cpSync(resolve(root, "landing"), site, { recursive: true });
cpSync(resolve(root, "dist"), resolve(site, "dist"), { recursive: true });
cpSync(resolve(root, "demo/dist"), resolve(site, "demo"), { recursive: true });

const indexPath = resolve(site, "index.html");
let html = readFileSync(indexPath, "utf8");
html = html
  .replaceAll("../CONTRIBUTING.md", `${REPO}/CONTRIBUTING.md`)
  // Documentation links point at the deployed docs site (built into /docs/).
  .replaceAll("../README.md#migration-from-introjs", "./docs/guide/migration")
  .replaceAll("../README.md", "./docs/")
  .replaceAll("../CHANGELOG.md", `${REPO}/CHANGELOG.md`)
  .replaceAll("../LICENSE", `${REPO}/LICENSE`)
  .replaceAll("../dist/", "./dist/")
  .replaceAll("../demo/", "./demo/");
writeFileSync(indexPath, html);

console.log("site/ assembled for GitHub Pages");
