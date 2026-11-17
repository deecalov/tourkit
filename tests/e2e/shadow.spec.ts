import { expect, test } from "@playwright/test";

/**
 * Shadow DOM in a real browser.
 *
 * jsdom delivers mutations inside a ShadowRoot to an observer registered on
 * `document.body`; browsers do not — per the DOM spec `subtree` observation
 * stops at the shadow boundary. A unit test of "target mounted late inside a
 * scoped ShadowRoot" therefore passes even without the watcher observing the
 * scope, and only a browser can tell the difference.
 */
test.describe("shadow DOM", () => {
  test("waitForTarget picks up a target mounted late inside the scoped ShadowRoot", async ({
    page,
  }) => {
    await page.goto("/");

    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "shadow-host";
      // Out of flow with a fixed size: the late mount below must not resize the
      // document, or the autoUpdater's ResizeObserver resync would find the
      // target on its own and mask a watcher that cannot see the shadow tree.
      host.style.cssText = "position:fixed;top:120px;left:120px;width:320px;height:200px";
      document.body.append(host);
      const shadow = host.attachShadow({ mode: "open" });

      return globalThis.TourKitDemo.createTour({
        root: shadow,
        overlay: { transitionMs: 0 },
        steps: [{ target: "#shadow-late", content: "inside the shadow tree" }],
      }).start();
    });

    const tooltip = page.locator(".tk-tooltip");
    await expect(tooltip).toHaveClass(/tk-tooltip--center/);

    // Let the mount-time signals settle (initial ResizeObserver callback, the
    // fade-in frame) so only the waitForTarget watcher can notice the mount.
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const shadow = document.getElementById("shadow-host")!.shadowRoot!;
      const late = document.createElement("button");
      late.id = "shadow-late";
      late.textContent = "late";
      late.style.cssText = "position:absolute;top:20px;left:20px;width:80px;height:30px";
      shadow.append(late);
    });

    await expect(tooltip).not.toHaveClass(/tk-tooltip--center/, { timeout: 3000 });
  });

  test("Esc in an input inside a web component keeps the tour; focus returns into the shadow tree", async ({
    page,
  }) => {
    await page.goto("/");

    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "shadow-widget";
      host.style.cssText = "position:fixed;top:120px;left:120px";
      document.body.append(host);
      host.attachShadow({ mode: "open" }).innerHTML =
        '<button id="shadow-launch">Launch</button><input id="shadow-field" aria-label="Field">';
    });

    const launch = page.locator("#shadow-launch");
    await launch.focus();
    await page.evaluate(() =>
      globalThis.TourKitDemo.createTour({
        steps: [{ content: "first" }, { content: "second" }],
      }).start()
    );
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    // document.activeElement is the shadow host here; the tour must look
    // through it and treat the focused <input> as a host editing control.
    await page.locator("#shadow-field").focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await expect(page.locator(".tk-tooltip")).toBeVisible();

    // Ending the tour restores focus to the element that had it at start,
    // even though that element lives inside a shadow root.
    await page.locator(".tk-tooltip__close").click();
    await expect(page.locator(".tk-root")).toHaveCount(0);
    await expect(launch).toBeFocused();
  });
});
