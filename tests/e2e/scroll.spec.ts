import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Scrolling to targets and scroll locking against real layout — jsdom has
 * none. The pages are built with setContent and the dist bundle (like
 * integration.spec.ts) because they need full control over <html>:
 * scrollbar-gutter, the document scroller, sticky headers. Build first.
 *
 * Playwright hides scrollbars in headless Chromium; the lock test needs the
 * classic scrollbar to be meaningful, so keep it.
 */
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");

const bundle = (file: string): string => {
  const path = resolve(distDir, file);
  if (!existsSync(path)) {
    throw new Error(`${file} is missing — run "npm run build" before the e2e suite.`);
  }
  return readFileSync(path, "utf8");
};

async function openPage(page: Page, body: string): Promise<void> {
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`
  );
  await page.addStyleTag({ content: bundle("styles.css") });
  await page.addScriptTag({ content: bundle("index.global.js") });
}

test.describe("scrolling and scroll locking", () => {
  for (const gutter of ["stable", "auto"]) {
    test(`lockScroll keeps the layout still (scrollbar-gutter: ${gutter})`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "classic scrollbars are only guaranteed in Chromium");
      await openPage(
        page,
        `<style>html{scrollbar-gutter:${gutter}} body{margin:0}</style>
         <div id="bar" style="height:20px"></div><div style="height:3000px"></div>`
      );

      const result = await page.evaluate(async () => {
        const bar = document.getElementById("bar")!;
        const scrollbar = window.innerWidth - document.documentElement.clientWidth;
        const before = bar.getBoundingClientRect().width;
        const tour = globalThis.TourKit.createTour({ lockScroll: true, steps: [{ content: "x" }] });
        await tour.start();
        const during = bar.getBoundingClientRect().width;
        tour.destroy();
        return { scrollbar, shift: before - during };
      });

      test.skip(result.scrollbar === 0, "no classic scrollbar on this platform");
      expect(result.shift).toBe(0);
    });
  }

  test("a target clipped by a nested scroller is scrolled into view", async ({ page }) => {
    await openPage(
      page,
      `<style>body{margin:0}</style>
       <div id="scroller" style="height:200px;overflow:auto;margin-top:50px;border:1px solid #999">
         <div style="height:260px">filler</div>
         <button id="clipped" style="display:block;height:30px">Clipped target</button>
         <div style="height:1000px"></div>
       </div>
       <div style="height:2000px"></div>`
    );

    // The button sits inside the viewport (y ≈ 311) but below the scroller's
    // visible box (50..252): a viewport-only check would skip the scroll.
    const inside = await page.evaluate(async () => {
      const tour = globalThis.TourKit.createTour({
        overlay: { transitionMs: 0 },
        scroll: { behavior: "auto" },
        steps: [{ target: "#clipped", content: "x" }],
      });
      await tour.start();
      const r = document.getElementById("clipped")!.getBoundingClientRect();
      const s = document.getElementById("scroller")!.getBoundingClientRect();
      tour.destroy();
      return r.top >= s.top && r.bottom <= s.bottom;
    });

    expect(inside).toBe(true);
  });

  test("the page's scroll-margin-top keeps the target clear of a sticky header", async ({
    page,
  }) => {
    await openPage(
      page,
      `<style>
         body{margin:0}
         header{position:sticky;top:0;height:80px;background:#ccc;z-index:5}
         #t{display:block;scroll-margin-top:100px}
       </style>
       <header>Sticky header</header><div style="height:2000px"></div>
       <button id="t">Target</button><div style="height:3000px"></div>`
    );

    const top = await page.evaluate(async () => {
      window.scrollTo(0, 3500); // the target is now above the viewport
      const tour = globalThis.TourKit.createTour({
        overlay: { transitionMs: 0 },
        scroll: { behavior: "auto", block: "nearest" },
        steps: [{ target: "#t", content: "x" }],
      });
      await tour.start();
      const value = document.getElementById("t")!.getBoundingClientRect().top;
      tour.destroy();
      return value;
    });

    expect(top).toBeGreaterThanOrEqual(80);
  });

  test("an inline scroll-margin-top on the target survives the tour's scroll", async ({ page }) => {
    await openPage(
      page,
      `<style>body{margin:0}</style><div style="height:2000px"></div>
       <button id="t" style="display:block;scroll-margin-top:100px">Target</button>
       <div style="height:2000px"></div>`
    );

    const after = await page.evaluate(async () => {
      const tour = globalThis.TourKit.createTour({
        overlay: { transitionMs: 0 },
        scroll: { behavior: "auto" },
        steps: [{ target: "#t", content: "x" }],
      });
      await tour.start();
      tour.destroy();
      return document.getElementById("t")!.style.getPropertyValue("scroll-margin-top");
    });

    expect(after).toBe("100px");
  });
});
