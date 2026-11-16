import { expect, test, type Page } from "@playwright/test";

/**
 * Mobile viewport checks: the tooltip must respect the solver's 8px side
 * padding on narrow screens, footer controls stay reachable, taps work.
 */

const expectTooltipInsideViewport = async (page: Page, viewportWidth: number) => {
  const box = (await page.locator(".tk-tooltip").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(7); // 8px minus rounding
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth - 7);
};

test.describe("mobile 375x667", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test("tooltip fits the viewport on centered and anchored steps", async ({ page }) => {
    await page.goto("/");
    await page.tap("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();
    await expectTooltipInsideViewport(page, 375);

    await page.tap(".tk-button--primary"); // step 2 targets the button
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Starting a tour");
    await expectTooltipInsideViewport(page, 375);
  });

  test("taps drive navigation and closing", async ({ page }) => {
    await page.goto("/");
    await page.tap("#start-js");

    await page.tap(".tk-button--primary");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Starting a tour");

    await page.tap(".tk-tooltip__close");
    await expect(page.locator(".tk-root")).toHaveCount(0);
  });

  test("hint markers are tappable via the expanded hit area", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.tap("#toggle-hints");

    // Markers are fixed-positioned trackers of their targets: on a narrow
    // screen the card sits below the fold, so scroll it into view first
    // (autoUpdate re-anchors the marker on scroll).
    await page.locator("#card-analytics").scrollIntoViewIfNeeded();
    await expect(page.locator(".tk-hint").first()).toBeInViewport();

    await page.locator(".tk-hint").first().tap();
    await expect(page.locator(".tk-hint-popover")).toBeVisible();
    await expectPopoverInside(page, 375);
  });
});

const expectPopoverInside = async (page: Page, viewportWidth: number) => {
  const box = (await page.locator(".tk-hint-popover").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth);
};

test.describe("mobile 320x568 (narrowest)", () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test("tooltip clamps to the viewport width", async ({ page }) => {
    await page.goto("/");
    await page.tap("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    await expectTooltipInsideViewport(page, 320);

    const width = (await page.locator(".tk-tooltip").boundingBox())!.width;
    expect(width).toBeLessThanOrEqual(320 - 16 + 1); // max-width: 100vw - 16px
  });
});
