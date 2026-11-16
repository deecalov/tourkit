import { defineConfig } from "@playwright/test";

/**
 * Standalone performance-bench project. Kept separate from the regression
 * e2e config on purpose: different server root (the whole package, so
 * `bench/` pages can import both `src/` and `node_modules`), no retries,
 * single worker, reduced motion for determinism.
 */
export default defineConfig({
  testDir: "bench",
  testMatch: /bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5178",
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npx vite . --port 5178 --strictPort",
    url: "http://localhost:5178/bench/stand.html",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
