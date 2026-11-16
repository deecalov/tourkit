import { expect, test, type Page } from "@playwright/test";
import { type createTour as createTourFn } from "../../src/index";

const startTour = async (page: Page) => {
  await page.goto("/");
  await page.click("#start-js");
  await expect(page.locator(".tk-tooltip")).toBeVisible();
};

test.describe("tour", () => {
  test("full walkthrough to completion restores focus", async ({ page }) => {
    await page.goto("/");
    // Focus the launcher explicitly: WebKit does not focus buttons on click,
    // and the test asserts focus restoration to the previously focused element.
    await page.locator("#start-js").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    // 6 steps in the demo tour: Next/Done all the way.
    for (let i = 0; i < 5; i++) {
      await page.click(".tk-button--primary");
    }
    await expect(page.locator(".tk-button--primary")).toHaveAttribute("data-tk-action", "done");
    await page.click(".tk-button--primary");

    await expect(page.locator(".tk-root")).toHaveCount(0);
    await expect(page.locator("#start-js")).toBeFocused();
  });

  test("Escape exits without completing", async ({ page }) => {
    await startTour(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".tk-root")).toHaveCount(0);
  });

  test("backdrop click exits, clicks pass through the cutout", async ({ page }) => {
    await startTour(page);
    await page.click(".tk-button--primary"); // step 2 targets #start-js

    // Click the dimmed area far from the cutout.
    await page.locator(".tk-overlay__path").click({ position: { x: 900, y: 600 } });
    await expect(page.locator(".tk-root")).toHaveCount(0);
  });

  test("keyboard arrows navigate between steps", async ({ page }) => {
    await startTour(page);

    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Starting a tour");

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Welcome!");
  });

  test("scrolls to a far target and keeps the spotlight aligned", async ({ page }) => {
    await startTour(page);

    // Jump to the far-away card (step 5, index 4).
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft"); // step 5 targets #far-card

    // Smooth scroll + cutout flow are asynchronous: poll until settled.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const target = document.querySelector("#far-card")!.getBoundingClientRect();
            const d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
            const cut = d.split("Z")[1]!;
            const m = cut.match(/M([\d.-]+) ([\d.-]+)/)!;
            const padding = 8;
            const radius = 8;
            const dx = Math.abs(parseFloat(m[1]!) - radius - (target.left - padding));
            const dy = Math.abs(parseFloat(m[2]!) - (target.top - padding));
            const inView = target.top >= 0 && target.bottom <= window.innerHeight;
            return inView && dx < 1.5 && dy < 1.5;
          }),
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("highlights a target inside a transform stacking context", async ({ page }) => {
    await startTour(page);
    // Step 4 (index 3) targets #transformed-box.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");

    // The cutout "flows" to the new stage for ~300ms — poll until it settles.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const target = document.querySelector("#transformed-box")!.getBoundingClientRect();
            const d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
            const m = d.split("Z")[1]!.match(/M([\d.-]+) ([\d.-]+)/)!;
            return Math.abs(parseFloat(m[2]!) - (target.top - 8));
          }),
        { timeout: 3000 }
      )
      .toBeLessThan(1.5);
  });

  test("multi-cutout: step.highlight adds extra spotlight holes", async ({ page }) => {
    await startTour(page);
    // Step 3 (index 2) highlights all three cards.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Cards");

    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector(".tk-overlay__path")!.getAttribute("d")!.match(/M/g)!.length
        )
      )
      // outer rect + main cutout + 2 extra highlights
      .toBe(4);
  });

  test("data-tour-trigger starts a scanned tour declaratively", async ({ page }) => {
    await page.goto("/");
    await page.click("#start-data"); // the button carries data-tour-trigger

    await expect(page.locator(".tk-tooltip")).toBeVisible();
    // Scanned from [data-tour] markup: unnumbered elements fill the gaps
    // before the ones claiming data-tour-step slots 3 and 4.
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Profile");
    await page.keyboard.press("Escape");
  });

  test("compat adapter runs an intro.js-style tour", async ({ page }) => {
    await page.goto("/");
    await page.click("#start-compat");

    await expect(page.locator(".tk-tooltip__title")).toHaveText("Compat mode");
    await page.click(".tk-button--primary");
    await expect(page.locator(".tk-tooltip__content")).toContainText("mapped automatically");

    await page.keyboard.press("Escape");
    await expect(page.locator(".tk-root")).toHaveCount(0);
  });
});

test.describe("hints", () => {
  test("markers open popovers; dismiss persists across reloads", async ({ page }) => {
    await page.goto("/");
    await page.click("#toggle-hints");

    const markers = page.locator(".tk-hint");
    await expect(markers).toHaveCount(3);

    await markers.first().click();
    await expect(page.locator(".tk-hint-popover")).toBeVisible();
    await expect(page.locator(".tk-hint-popover__content")).toContainText("every 5 minutes");

    await page.click(".tk-hint-popover__button");
    await expect(page.locator(".tk-hint-popover")).toHaveCount(0);
    await expect(markers.first()).toBeHidden();

    // Persistence: after reload the dismissed marker stays hidden.
    await page.reload();
    await page.click("#toggle-hints");
    await expect(page.locator(".tk-hint")).toHaveCount(3);
    await expect(page.locator(".tk-hint").first()).toBeHidden();

    await page.evaluate(() => localStorage.clear());
  });

  test("Escape closes an open popover", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.click("#toggle-hints");

    await page.locator(".tk-hint").nth(1).click();
    await expect(page.locator(".tk-hint-popover")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".tk-hint-popover")).toHaveCount(0);
  });
});

test.describe("multi-page tour (persistProgress)", () => {
  test("continues on the second page and clears the key on completion", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.click("#start-mp");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Multi-page tour");

    await page.click(".tk-button--primary"); // → the step on the link
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Navigation");

    // The click passes through the spotlight cutout and navigates to page 2.
    await page.click("#to-page2");
    await page.waitForURL("**/page2.html");

    // The tour resumed by itself with the page 2 step.
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Page 2 already");

    await page.click(".tk-button--primary");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("The end");

    await page.click(".tk-button--primary"); // Done
    await expect(page.locator(".tk-root")).toHaveCount(0);

    expect(await page.evaluate(() => localStorage.getItem("demo:mp"))).toBeNull();
  });
});

test.describe("async target (waitForTarget + advanceOn)", () => {
  test("waits for a lazily mounted target, then a target click advances", async ({ page }) => {
    await page.goto("/");
    await page.click("#start-async");

    // Step 1: floating intro while nothing is mounted yet.
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Async target");
    await page.click(".tk-button--primary");

    // Step 2 targets #async-panel which appears ~900ms after the tour start:
    // the step floats first, then anchors once the panel mounts.
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Click the panel");
    await expect(page.locator("#async-panel")).toBeVisible();
    await expect
      .poll(async () => {
        // Anchored = the spotlight cutout wraps the panel (same center).
        return page.evaluate(() => {
          const d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
          const r = document.getElementById("async-panel")!.getBoundingClientRect();
          const m = d.match(/ M(-?[\d.]+) (-?[\d.]+)/);
          if (!m) return false;
          // Inner subpath starts at (x + radius, y) of the stage = rect - 8.
          return Math.abs(Number(m[2]) - (r.top - 8)) < 2;
        });
      })
      .toBe(true);

    // advanceOn: clicking the highlighted panel moves the tour forward.
    await page.click("#async-panel");
    await expect(page.locator(".tk-tooltip__title")).toHaveText("Done");

    await page.click(".tk-button--primary"); // Done
    await expect(page.locator(".tk-root")).toHaveCount(0);
  });
});

test.describe("standalone highlight()", () => {
  test("spotlights an element without a tooltip and dismisses on Escape", async ({ page }) => {
    await page.goto("/");
    await page.click("#spotlight-btn");

    await expect(page.locator(".tk-highlight .tk-overlay")).toBeVisible();
    await expect(page.locator(".tk-tooltip")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.locator(".tk-highlight")).toHaveCount(0);
  });
});

test.describe("showOnce", () => {
  test("completed tour does not start again", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    // The demo exposes the library on window.TourKitDemo for e2e scenarios.
    const result = await page.evaluate(async () => {
      const { createTour } = (
        window as unknown as { TourKitDemo: { createTour: typeof createTourFn } }
      ).TourKitDemo;

      const make = () =>
        createTour({ showOnce: { key: "e2e:once" }, steps: [{ content: "only step" }] });

      const first = make();
      await first.start();
      await first.next(); // completes the single-step tour
      await new Promise((r) => setTimeout(r, 300)); // exit fade

      const second = make();
      const startedAgain = await second.start();
      return { startedAgain, stored: localStorage.getItem("e2e:once") };
    });

    expect(result.startedAgain).toBe(false);
    // Stamped so `showOnce.ttlMs` can expire the opt-out later.
    expect(result.stored).toMatch(/^\{"v":1,"t":\d+\}$/);
  });
});
