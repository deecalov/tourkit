import { beforeEach, describe, expect, it } from "vitest";
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
});
