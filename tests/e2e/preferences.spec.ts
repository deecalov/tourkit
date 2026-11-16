import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * User and OS preferences the unit suite cannot observe: colour scheme,
 * reduced motion, forced colours, RTL and modal semantics all live in CSS
 * or in the real focus system.
 */

test.describe("theme: auto", () => {
  test.use({ colorScheme: "dark" });

  test("follows prefers-color-scheme when the theme is auto", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      globalThis.TourKitDemo.createTour({
        theme: "auto",
        steps: [{ content: "auto theme" }],
      }).start()
    );

    const tooltip = page.locator(".tk-tooltip");
    await expect(tooltip).toBeVisible();

    // The dark half of the auto theme paints the graphite surface.
    const background = await tooltip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe("rgb(21, 23, 28)");
  });
});

test.describe("reduced motion", () => {
  test("skips the spotlight flow and exits without waiting for a fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.click("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    // Step 2 anchors to #start-js: with motion reduced the cutout is painted
    // at its final geometry on the first frame, without interpolation.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Starting a tour");

    const aligned = await page.evaluate(() => {
      const d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
      const rect = document.getElementById("start-js")!.getBoundingClientRect();
      const match = d.match(/ M(-?[\d.]+) (-?[\d.]+)/);
      return match ? Math.abs(Number(match[2]) - (rect.top - 8)) < 2 : false;
    });
    expect(aligned).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator(".tk-root")).toHaveCount(0);
  });
});

test.describe("forced colors", () => {
  // Chromium is the only engine exposing forced-colors emulation.
  test.skip(({ browserName }) => browserName !== "chromium", "chromium-only emulation");

  test("keeps the tooltip and spotlight legible in high contrast", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await page.click("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    // The forced-colors block replaces the dropped box-shadow with a border
    // and repaints the scrim with system colours.
    const borderWidth = await page
      .locator(".tk-tooltip")
      .evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(borderWidth).toBe("1px");

    const fillOpacity = await page
      .locator(".tk-overlay__path")
      .evaluate((el) => getComputedStyle(el).fillOpacity);
    expect(Number(fillOpacity)).toBeCloseTo(0.4, 2);
  });
});

test.describe("RTL", () => {
  test("mirrors logical alignment and keeps the tooltip on screen", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
      return globalThis.TourKitDemo.createTour({
        overlay: { transitionMs: 0 },
        steps: [{ target: "#card-analytics", content: "rtl", placement: "bottom-start" }],
      }).start();
    });

    await expect(page.locator(".tk-tooltip")).toBeVisible();

    const { tooltip, target, viewport } = await page.evaluate(() => ({
      tooltip: document.querySelector(".tk-tooltip")!.getBoundingClientRect().toJSON(),
      target: document.getElementById("card-analytics")!.getBoundingClientRect().toJSON(),
      viewport: document.documentElement.clientWidth,
    }));

    // "start" mirrors to the right edge in RTL. The tooltip anchors to the
    // spotlight cutout, which is the target rect grown by overlay.padding (8).
    expect(Math.abs(tooltip.right - (target.right + 8))).toBeLessThan(2);
    expect(tooltip.left).toBeGreaterThanOrEqual(0);
    expect(tooltip.right).toBeLessThanOrEqual(viewport);

    await page.evaluate(() => {
      document.documentElement.dir = "";
    });
  });
});

test.describe("modal mode", () => {
  test("inerts the page, locks scrolling and keeps Tab inside", async ({ page }) => {
    await page.goto("/");
    await page.click("#start-modal");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    await expect(page.locator(".tk-tooltip")).toHaveAttribute("aria-modal", "true");
    await expect(page.locator("main")).toHaveAttribute("inert", "");

    const overflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
    expect(overflow).toBe("hidden");

    // Tab cannot escape into the inert page. Focus lands on the primary button
    // asynchronously, so settle first — firefox is a frame behind chromium here.
    const focusInsideTour = () =>
      page.evaluate(() => document.activeElement?.closest(".tk-root") !== null);
    await expect.poll(focusInsideTour).toBe(true);

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      await expect.poll(focusInsideTour).toBe(true);
    }

    const violations = await new AxeBuilder({ page }).include(".tk-root").analyze();
    expect(
      violations.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.locator(".tk-root")).toHaveCount(0);
    await expect(page.locator("main")).not.toHaveAttribute("inert", "");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });
});

test.describe("keyboard shortcuts", () => {
  test("Home and End jump to the first and last step", async ({ page }) => {
    await page.goto("/");
    await page.click("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    await page.keyboard.press("End");
    await expect(page.locator(".tk-button--primary")).toHaveAttribute("data-tk-action", "done");

    await page.keyboard.press("Home");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Welcome!");

    await page.keyboard.press("Escape");
  });
});
