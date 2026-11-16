import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const seriousViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).include(".tk-root").analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
};

test.describe("a11y (axe-core)", () => {
  test("open tour tooltip has no serious violations", async ({ page }) => {
    await page.goto("/");
    await page.click("#start-js");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    expect(await seriousViolations(page)).toEqual([]);

    // A step with a target and buttons enabled.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Starting a tour");
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("open hint popover has no serious violations", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.click("#toggle-hints");

    await page.locator(".tk-hint").first().click();
    await expect(page.locator(".tk-hint-popover")).toBeVisible();

    expect(await seriousViolations(page)).toEqual([]);
  });
});
