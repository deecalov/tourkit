import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTarget } from "../src/core/engine";
import { fromDataAttributes } from "../src/tour/steps";
import { fakeRect, mountHints, mountTour, overlayPath, withRect } from "./helpers";

/**
 * Web components: `document.querySelector` stops at the shadow boundary, so
 * without the `root` option a selector step silently floats in the middle of
 * the screen.
 */
function mountWidget(): ShadowRoot {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });

  const inner = document.createElement("button");
  inner.id = "inside";
  inner.setAttribute("data-tour", "Inside the shadow tree");
  inner.setAttribute("data-tour-title", "Shadow");
  withRect(inner, fakeRect(100, 60, 40, 20));
  shadow.append(inner);

  return shadow;
}

describe("shadow DOM support", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolveTarget cannot see into a shadow tree without a scope", () => {
    mountWidget();
    expect(resolveTarget("#inside")).toBeNull();
  });

  it("resolveTarget queries inside the given scope", () => {
    const shadow = mountWidget();
    expect(resolveTarget("#inside", shadow)).toBe(shadow.getElementById("inside"));
  });

  it("a tour scoped with root spotlights the shadow element", async () => {
    const shadow = mountWidget();
    const tour = mountTour({
      root: shadow,
      overlay: { transitionMs: 0 },
      steps: [{ target: "#inside", content: "x" }],
    });

    await tour.start();

    // Stage = rect inflated by the 8px overlay padding.
    expect(overlayPath()).toContain("M100 52");
    expect(tour.steps[0]?.target).toBe("#inside");
  });

  it("the declarative scanner walks the shadow tree it was given", () => {
    const shadow = mountWidget();

    expect(fromDataAttributes(document)).toHaveLength(0);
    const scanned = fromDataAttributes(shadow);
    expect(scanned).toHaveLength(1);
    expect(scanned[0]?.title).toBe("Shadow");
  });

  it("hints resolve their targets through root as well", () => {
    const shadow = mountWidget();
    const hints = mountHints({
      root: shadow,
      hints: [{ target: "#inside", content: "hint" }],
    });

    hints.render();

    const marker = document.querySelector<HTMLElement>(".tk-hint")!;
    expect(marker.style.display).not.toBe("none");
    expect(marker.style.left).toBe("140px"); // middle-end anchor: x + width
  });

  it("waitForTarget detects a target mounted later inside a scoped ShadowRoot", async () => {
    const shadow = mountWidget();
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const tour = mountTour({
      root: shadow,
      overlay: { transitionMs: 0 },
      steps: [{ target: "#late-shadow", content: "Waiting inside shadow" }],
    });

    await tour.start();
    // jsdom (unlike browsers) reports shadow-tree mutations to an observer on
    // document.body, so the anchoring below would pass even if the scope were
    // not watched. Assert the watch itself; tests/e2e/shadow.spec.ts covers
    // the browser behaviour end to end.
    expect(observe).toHaveBeenCalledWith(shadow, expect.objectContaining({ subtree: true }));
    observe.mockRestore();
    expect(document.querySelector(".tk-tooltip")!.classList.contains("tk-tooltip--center")).toBe(
      true
    );

    const late = document.createElement("button");
    late.id = "late-shadow";
    withRect(late, fakeRect(80, 40, 50, 20));
    shadow.append(late);

    await vi.waitFor(() => expect(overlayPath()).toContain("M80 32"), { timeout: 2000 });
    expect(document.querySelector(".tk-tooltip")!.classList.contains("tk-tooltip--center")).toBe(
      false
    );
  });

  it("Escape inside an editable input in a ShadowRoot does not exit the tour", async () => {
    const shadow = mountWidget();
    const input = document.createElement("input");
    shadow.append(input);

    const tour = mountTour({
      root: shadow,
      steps: [{ target: "#inside", content: "Step 1" }],
    });
    await tour.start();

    input.focus();
    expect(shadow.activeElement).toBe(input);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tour.isActive).toBe(true);
  });

  it("restores focus to an element inside a ShadowRoot on exit", async () => {
    const shadow = mountWidget();
    const trigger = shadow.getElementById("inside") as HTMLButtonElement;
    trigger.focus();
    expect(shadow.activeElement).toBe(trigger);

    const tour = mountTour({
      root: shadow,
      steps: [{ content: "Floating" }],
    });
    await tour.start();
    expect(shadow.activeElement).not.toBe(trigger);

    await tour.exit(true);
    expect(shadow.activeElement).toBe(trigger);
  });
});
