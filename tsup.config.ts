import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const banner = `/*!
 * TourKit v${pkg.version} | MIT License
 * Dependency-free product tours. Independently implemented; contains no
 * Intro.js source code. Not affiliated with Intro.js.
 */`;

/** `export const version` in src/index.ts picks the value up at build time. */
const define = { __TK_VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs", "iife"],
    globalName: "TourKit",
    dts: true,
    sourcemap: true,
    minify: true,
    clean: true,
    target: "es2020",
    banner: { js: banner },
    define,
  },
  {
    entry: {
      hints: "src/hints/index.ts",
      "compat-introjs": "src/compat/introjs.ts",
      locales: "src/locales/index.ts",
      "inject-styles": "src/styles/inject.ts",
    },
    format: ["esm", "cjs"],
    // No shared chunk: the ESM entries are self-contained, like the CJS and
    // IIFE ones. Vendoring consumers (no bundler, files copied into wwwroot)
    // cannot follow a `chunk-<hash>.js` whose name changes every release.
    // The cost is a duplicated copy of the shared utilities when a page loads
    // two entries; the benefit is stable, individually copyable filenames.
    splitting: false,
    dts: true,
    sourcemap: true,
    minify: true,
    clean: false,
    target: "es2020",
    banner: { js: banner },
    define,
  },
  // Global builds for script-tag consumers (ASP.NET MVC etc.). Each optional
  // entry needs its own IIFE: the core global carries only the tour API, so
  // without these a <script> page cannot use hints or the migration adapter
  // at all. One config per entry — tsup allows a single globalName per build.
  {
    // window.TourKitLocales.ru / .de / ...
    entry: { locales: "src/locales/index.ts" },
    format: ["iife"],
    globalName: "TourKitLocales",
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    target: "es2020",
    banner: { js: banner },
  },
  {
    // window.TourKitHints.createHints(...)
    entry: { hints: "src/hints/index.ts" },
    format: ["iife"],
    globalName: "TourKitHints",
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    target: "es2020",
    banner: { js: banner },
    define,
  },
  {
    // window.TourKitIntroJs.introJs(...)
    entry: { "compat-introjs": "src/compat/introjs.ts" },
    format: ["iife"],
    globalName: "TourKitIntroJs",
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    target: "es2020",
    banner: { js: banner },
    define,
  },
]);
