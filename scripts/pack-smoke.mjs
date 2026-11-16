/**
 * Consumer smoke test: packs the library with `npm pack`, installs the
 * tarball into a temp project and verifies that every entry point resolves
 * and exposes its key exports from both CJS (`require`) and ESM (`import`).
 * Catches broken `exports` conditions that unit tests cannot see.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { name: pkgName, version: pkgVersion } = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
);

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

// Windows blocks spawning `npm.cmd` without a shell (CVE-2024-27980 fix);
// when launched through `npm run`, npm_execpath lets us call the JS CLI directly.
const npmCli = process.env.npm_execpath;
const runNpm = (args, cwd) =>
  npmCli && npmCli.endsWith(".js")
    ? run(process.execPath, [npmCli, ...args], cwd)
    : run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd);

const workDir = mkdtempSync(join(tmpdir(), "tourkit-pack-"));
const packageDir = join(workDir, "node_modules", ...pkgName.split("/"));
let failed = false;

try {
  const tarball = runNpm(["pack", "--pack-destination", workDir], root).trim().split("\n").pop();
  console.log(`packed: ${tarball}`);

  writeFileSync(
    join(workDir, "package.json"),
    JSON.stringify({ name: "tourkit-smoke", private: true, version: "0.0.0" })
  );
  runNpm(["install", "--no-save", "--no-audit", "--no-fund", join(workDir, tarball)], workDir);

  const cjsCheck = `
    const assert = require("node:assert");
    const core = require("${pkgName}");
    assert.equal(typeof core.createTour, "function", "createTour (cjs)");
    assert.equal(typeof core.highlight, "function", "highlight (cjs)");
    assert.equal(core.version, "${pkgVersion}", "version (cjs)");
    const hints = require("${pkgName}/hints");
    assert.equal(typeof hints.createHints, "function", "createHints (cjs)");
    const compat = require("${pkgName}/compat-introjs");
    assert.equal(typeof compat.introJs, "function", "introJs (cjs)");
    const locales = require("${pkgName}/locales");
    assert.equal(typeof locales.ru.next, "string", "locales.ru (cjs)");
    const inject = require("${pkgName}/inject-styles");
    assert.equal(typeof inject.injectStyles, "function", "injectStyles (cjs)");
    assert.equal(typeof inject.css, "string", "css (cjs)");
    console.log("cjs require: ok");
  `;
  writeFileSync(join(workDir, "check.cjs"), cjsCheck);
  console.log(run(process.execPath, ["check.cjs"], workDir).trim());

  const esmCheck = `
    import assert from "node:assert";
    import { createTour, highlight, version } from "${pkgName}";
    import { createHints } from "${pkgName}/hints";
    import { introJs } from "${pkgName}/compat-introjs";
    import { ru } from "${pkgName}/locales";
    import { injectStyles, css } from "${pkgName}/inject-styles";
    assert.equal(typeof createTour, "function", "createTour (esm)");
    assert.equal(typeof highlight, "function", "highlight (esm)");
    assert.equal(version, "${pkgVersion}", "version (esm)");
    assert.equal(typeof createHints, "function", "createHints (esm)");
    assert.equal(typeof introJs, "function", "introJs (esm)");
    assert.equal(typeof ru.next, "string", "locales.ru (esm)");
    assert.equal(typeof injectStyles, "function", "injectStyles (esm)");
    assert.equal(typeof css, "string", "css (esm)");
    console.log("esm import: ok");
  `;
  writeFileSync(join(workDir, "check.mjs"), esmCheck);
  console.log(run(process.execPath, ["check.mjs"], workDir).trim());

  const styles = join(packageDir, "dist", "styles.css");
  if (!existsSync(styles)) throw new Error("dist/styles.css missing from the package");
  if (!readFileSync(styles, "utf8").includes(`TourKit v${pkgVersion} | MIT License`)) {
    throw new Error("dist/styles.css banner does not carry the package version");
  }
  console.log("styles.css: ok");

  // Script-tag consumers: every global build must ship and define its global.
  const globals = {
    "index.global.js": "TourKit",
    "hints.global.js": "TourKitHints",
    "compat-introjs.global.js": "TourKitIntroJs",
    "locales.global.js": "TourKitLocales",
  };
  for (const [file, name] of Object.entries(globals)) {
    const path = join(packageDir, "dist", file);
    if (!existsSync(path)) throw new Error(`dist/${file} missing from the package`);
    if (!readFileSync(path, "utf8").includes(name)) {
      throw new Error(`dist/${file} does not define the ${name} global`);
    }
  }
  console.log(`globals: ok (${Object.values(globals).join(", ")})`);

  // Vendoring (files copied into wwwroot, no bundler) needs stable names: a
  // hashed shared chunk would have to be re-copied under a new name on every
  // release, and nothing in the HTML would point at it.
  const chunks = readdirSync(join(packageDir, "dist")).filter((file) => file.startsWith("chunk-"));
  if (chunks.length > 0) {
    throw new Error(`hashed chunks leaked into the package: ${chunks.join(", ")}`);
  }
  console.log("no hashed chunks: ok");

  console.log("pack smoke test passed");
} catch (error) {
  failed = true;
  console.error(error.message ?? error);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (failed) process.exit(1);
