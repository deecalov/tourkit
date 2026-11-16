import { expect, test } from "@playwright/test";

/**
 * Visual regression: element screenshots of the tooltip and hint popover.
 * Baselines live next to this spec (platform-suffixed); refresh with
 * `npm run test:e2e -- --update-snapshots`.
 */
test.use({ colorScheme: "light" });

test.beforeEach(async ({ page }) => {
  // Disable the spotlight flow / fade animations for stable pixels.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  // Late font loads shift layout and therefore the settled scroll position
  // of full-viewport screenshots — wait for them up front.
  await page.evaluate(() => document.fonts.ready);
});

const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.02 };

test.describe("visual", () => {
  test("tooltip: centered welcome step (default light theme)", async ({ page }) => {
    await page.click("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    await expect(page.locator(".tk-tooltip")).toHaveScreenshot(
      "tooltip-center-default.png",
      SCREENSHOT_OPTS
    );
  });

  test("tooltip: bottom placement with arrow and progress", async ({ page }) => {
    await page.click("#start-js");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Starting a tour");

    await expect(page.locator(".tk-tooltip")).toHaveScreenshot(
      "tooltip-bottom-default.png",
      SCREENSHOT_OPTS
    );
  });

  test("tooltip: dark variant on a dark page", async ({ page }) => {
    await page.click("#theme-toggle"); // dark page → theme: "dark"
    await page.click("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    await expect(page.locator(".tk-tooltip")).toHaveScreenshot(
      "tooltip-dark-variant.png",
      SCREENSHOT_OPTS
    );
  });

  test("hint popover", async ({ page }) => {
    await page.click("#toggle-hints");
    await page.locator(".tk-hint").first().click();
    await expect(page.locator(".tk-hint-popover")).toBeVisible();

    await expect(page.locator(".tk-hint-popover")).toHaveScreenshot(
      "hint-popover.png",
      SCREENSHOT_OPTS
    );
  });

  test("spotlight over the page (viewport)", async ({ page }) => {
    await page.click("#start-js");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Starting a tour");

    await expect(page).toHaveScreenshot("spotlight-viewport.png", {
      ...SCREENSHOT_OPTS,
      fullPage: false,
    });
  });
});
