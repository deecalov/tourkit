import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: 1,
  // The shared vite dev server chokes under too many parallel browser
  // connections (NS_ERROR_CONNECTION_REFUSED flakes with 3 engines).
  workers: 2,
  reporter: [["list"]],
  // Plain browserName projects (no device presets): every browser inherits
  // the shared viewport below, which the visual snapshots were captured with.
  use: {
    baseURL: "http://localhost:5177",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
    {
      name: "firefox",
      use: { browserName: "firefox" },
      // Visual snapshots are captured on chromium only.
      testIgnore: /visual\.spec\.ts/,
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      testIgnore: /visual\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npx vite demo --port 5177 --strictPort",
    url: "http://localhost:5177",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
