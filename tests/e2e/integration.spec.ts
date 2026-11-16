import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");

const bundle = (file: string): string => {
  const path = resolve(distDir, file);
  if (!existsSync(path)) {
    throw new Error(`${file} is missing — run "npm run build" before the e2e suite.`);
  }
  return readFileSync(path, "utf8");
};

test.describe("script-tag distribution", () => {
  test("the IIFE bundles expose their globals and drive a real tour", async ({ page }) => {
    await page.goto("/");
    await page.addScriptTag({ content: bundle("index.global.js") });
    await page.addScriptTag({ content: bundle("hints.global.js") });
    await page.addScriptTag({ content: bundle("compat-introjs.global.js") });
    await page.addScriptTag({ content: bundle("locales.global.js") });

    expect(
      await page.evaluate(() => ({
        tour: typeof globalThis.TourKit,
        hints: typeof globalThis.TourKitHints,
        compat: typeof (globalThis as { TourKitIntroJs?: unknown }).TourKitIntroJs,
        locales: typeof (globalThis as { TourKitLocales?: unknown }).TourKitLocales,
      }))
    ).toEqual({ tour: "object", hints: "object", compat: "object", locales: "object" });

    // The global build is the whole public API for a <script> page: run a tour
    // through it end to end, not just a typeof check.
    await page.evaluate(() =>
      globalThis.TourKit.createTour({
        steps: [{ target: "#card-analytics", content: "from the global build" }],
      }).start()
    );

    await expect(page.locator(".tk-tooltip__content")).toHaveText("from the global build");

    await page.evaluate(() => {
      globalThis.TourKitHints.createHints({
        hints: [{ target: "#card-reports", content: "global hint" }],
      }).render();
    });

    await expect(page.locator(".tk-hint")).toHaveCount(1);
  });

  test("the shipped stylesheet carries the package version", () => {
    const pkg = JSON.parse(readFileSync(resolve(distDir, "../package.json"), "utf8")) as {
      version: string;
    };

    expect(bundle("styles.css")).toContain(`TourKit v${pkg.version} | MIT License`);
  });
});

test.describe("injectStyles in the browser", () => {
  test("adopts a constructable stylesheet into a shadow root", async ({ page }) => {
    await page.goto("/");

    const adopted = await page.evaluate(() => {
      const host = document.createElement("div");
      document.body.append(host);
      const shadow = host.attachShadow({ mode: "open" });

      const cleanup = globalThis.TourKitDemo.injectStyles({ target: shadow });
      const count = shadow.adoptedStyleSheets.length;
      cleanup();

      return { count, afterCleanup: shadow.adoptedStyleSheets.length };
    });

    expect(adopted).toEqual({ count: 1, afterCleanup: 0 });
  });

  test("is idempotent per target", async ({ page }) => {
    await page.goto("/");

    const count = await page.evaluate(() => {
      const { injectStyles } = globalThis.TourKitDemo;

      const before = document.adoptedStyleSheets.length;
      const cleanup = injectStyles();
      injectStyles();
      const after = document.adoptedStyleSheets.length;
      cleanup();
      return { added: after - before, restored: document.adoptedStyleSheets.length - before };
    });

    expect(count).toEqual({ added: 1, restored: 0 });
  });
});

test.describe("nested scroll containers", () => {
  test("the spotlight follows a target scrolled inside a container", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(() => {
      const box = document.createElement("div");
      box.id = "scroll-box";
      box.style.cssText = "height:200px;overflow:auto;border:1px solid #ccc;margin-top:24px";
      box.innerHTML =
        '<div style="height:600px"></div><div id="deep" style="height:40px">deep</div><div style="height:600px"></div>';
      document.querySelector("main")!.append(box);

      return globalThis.TourKitDemo.createTour({
        overlay: { transitionMs: 0 },
        scroll: { block: "off" },
        steps: [{ target: "#deep", content: "inside a scroller" }],
      }).start();
    });

    await expect(page.locator(".tk-tooltip")).toBeVisible();

    const offsetFromTarget = async () =>
      page.evaluate(() => {
        const d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
        const rect = document.getElementById("deep")!.getBoundingClientRect();
        const match = d.match(/ M(-?[\d.]+) (-?[\d.]+)/);
        return match ? Math.abs(Number(match[2]) - (rect.top - 8)) : Number.NaN;
      });

    await page.evaluate(() => {
      document.getElementById("scroll-box")!.scrollTop = 400;
    });
    // autoUpdate listens to scroll in the capture phase, so container scrolling
    // resyncs the cutout on the next frame.
    await expect.poll(offsetFromTarget, { timeout: 3000 }).toBeLessThan(2);

    await page.evaluate(() => {
      document.getElementById("scroll-box")!.scrollTop = 0;
    });
    await expect.poll(offsetFromTarget, { timeout: 3000 }).toBeLessThan(2);

    await page.keyboard.press("Escape");
  });
});
