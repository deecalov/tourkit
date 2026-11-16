import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  // Mirrors the tsup build: `version` in src/index.ts must match package.json.
  define: { __TK_VERSION__: JSON.stringify(pkg.version) },
  test: {
    globals: true,
    // Suites that touch no DOM opt out per file with `@vitest-environment node`:
    // spinning up jsdom costs several seconds per file.
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Booting one jsdom per worker is memory- and IO-heavy; unbounded workers
    // on a many-core machine starve the module transform and surface as
    // "Timeout calling fetch" on random files.
    maxWorkers: 4,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/styles/css.generated.ts"],
      reporter: ["text", "text-summary"],
      thresholds: {
        statements: 95,
        branches: 88,
        functions: 92,
        lines: 95,
      },
    },
  },
});
