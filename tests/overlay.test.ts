import { describe, expect, it } from "vitest";
import { SpotlightOverlay, roundedRectPath } from "../src/ui/overlay";
import type { OverlayOptions } from "../src/core/types";

const overlayOptions: OverlayOptions = {
  opacity: 0.5,
  color: "#000",
  padding: 8,
  radius: 8,
  clickToExit: true,
  transitionMs: 0,
};

describe("roundedRectPath", () => {
  it("clamps the radius to half of the smaller dimension", () => {
    const d = roundedRectPath({ x: 0, y: 0, width: 10, height: 100 }, 50);
    // radius must be 5 (half width), not 50
    expect(d).toContain("a5 5");
  });

  it("degenerates gracefully for zero-size rects", () => {
    const d = roundedRectPath({ x: 30, y: 40, width: 0, height: 0 }, 8);
    expect(d).toBe("M30 40h0v0h0Z");
  });
});

describe("SpotlightOverlay dimming options", () => {
  it("applies custom color/opacity as inline CSS variables (they must beat the stylesheet)", () => {
    const overlay = new SpotlightOverlay(
      { ...overlayOptions, color: "#123456", opacity: 0.8 },
      { onBackdropClick: () => {} }
    );

    expect(overlay.el.style.getPropertyValue("--tk-overlay-color")).toBe("#123456");
    expect(overlay.el.style.getPropertyValue("--tk-overlay-opacity")).toBe("0.8");
    overlay.destroy();
  });

  it("leaves CSS variables untouched for default options so themes stay in control", () => {
    const overlay = new SpotlightOverlay(
      { ...overlayOptions, color: "#05070a", opacity: 0.5 },
      { onBackdropClick: () => {} }
    );

    expect(overlay.el.style.getPropertyValue("--tk-overlay-color")).toBe("");
    expect(overlay.el.style.getPropertyValue("--tk-overlay-opacity")).toBe("");
    overlay.destroy();
  });

  it("does not set fill presentation attributes on the path", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    const path = overlay.el.querySelector("path")!;

    // Presentation attributes would be overridden by the stylesheet anyway;
    // their absence proves the CSS-variable mechanism is the single source.
    expect(path.hasAttribute("fill")).toBe(false);
    expect(path.hasAttribute("fill-opacity")).toBe(false);
    overlay.destroy();
  });
});

describe("SpotlightOverlay coordinate space", () => {
  it("does not use a viewBox so user units map 1:1 to element pixels", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    overlay.setStage({ x: 100, y: 200, width: 50, height: 40 }, false);

    // Regression: a viewBox sized from window.innerWidth (which includes the
    // scrollbar) gets scaled into the element box and shifts the cutout.
    expect(overlay.el.hasAttribute("viewBox")).toBe(false);
    overlay.destroy();
  });

  it("paints the cutout at getBoundingClientRect coordinates unchanged", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    overlay.setStage({ x: 100, y: 200, width: 50, height: 40 }, false);

    const d = overlay.el.querySelector("path")!.getAttribute("d")!;
    // Inner subpath starts at x+radius, y of the stage rect.
    expect(d).toContain("M108 200");
    overlay.destroy();
  });

  it("paints extra cutouts for multi-highlight steps", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    overlay.setStage({ x: 100, y: 200, width: 50, height: 40 }, false, [
      { x: 300, y: 400, width: 60, height: 30 },
      { x: 500, y: 100, width: 20, height: 20 },
    ]);

    const d = overlay.el.querySelector("path")!.getAttribute("d")!;
    // outer rect + main cutout + 2 extras = 4 "M" subpaths
    expect(d.match(/M/g)).toHaveLength(4);
    expect(d).toContain("M308 400"); // extra #1 at x+radius
    overlay.destroy();
  });

  it("draws a separate ring path outlining the cutouts (no outer rect)", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    overlay.setStage({ x: 100, y: 200, width: 50, height: 40 }, false, [
      { x: 300, y: 400, width: 60, height: 30 },
    ]);

    const ring = overlay.el.querySelector(".tk-overlay__ring")!;
    const d = ring.getAttribute("d")!;
    expect(d.startsWith("M108 200")).toBe(true); // main cutout only, no viewport rect
    expect(d.match(/M/g)).toHaveLength(2); // main + one extra
    overlay.destroy();
  });

  it("hides the ring for a collapsed (centered) stage", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    overlay.setStage(null, false);

    expect(overlay.el.querySelector(".tk-overlay__ring")!.getAttribute("d")).toBe("");
    overlay.destroy();
  });

  it("keeps extras on instant refresh", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    overlay.refresh({ x: 0, y: 0, width: 10, height: 10 }, [
      { x: 50, y: 50, width: 10, height: 10 },
    ]);

    const d = overlay.el.querySelector("path")!.getAttribute("d")!;
    expect(d.match(/M/g)).toHaveLength(3);
    overlay.destroy();
  });

  it("skips the path rebuild when refresh() geometry is unchanged (dirty-check)", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    const stage = { x: 10, y: 20, width: 100, height: 50 };
    const extras = [{ x: 200, y: 200, width: 30, height: 30 }];
    overlay.refresh(stage, extras);

    // Corrupt the attribute: an unchanged refresh must not repaint over it.
    const path = overlay.el.querySelector("path")!;
    path.setAttribute("d", "corrupted");
    overlay.refresh({ ...stage }, [{ ...extras[0]! }]);
    expect(path.getAttribute("d")).toBe("corrupted");

    // Any real geometry change repaints immediately.
    overlay.refresh({ ...stage, x: 11 }, extras);
    expect(path.getAttribute("d")).not.toBe("corrupted");
    overlay.destroy();
  });

  it("repaints on refresh when the extras change, even with the same stage", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    const stage = { x: 10, y: 20, width: 100, height: 50 };
    overlay.refresh(stage, []);

    const path = overlay.el.querySelector("path")!;
    path.setAttribute("d", "corrupted");
    overlay.refresh(stage, [{ x: 300, y: 300, width: 20, height: 20 }]);
    expect(path.getAttribute("d")).not.toBe("corrupted");
    expect(path.getAttribute("d")!.match(/M/g)).toHaveLength(3);
    overlay.destroy();
  });

  it("draws the outer rect from the layout viewport size", () => {
    const overlay = new SpotlightOverlay(overlayOptions, { onBackdropClick: () => {} });
    overlay.setStage(null, false);

    const d = overlay.el.querySelector("path")!.getAttribute("d")!;
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = document.documentElement.clientHeight || window.innerHeight;
    expect(d.startsWith(`M0 0H${width}V${height}H0Z`)).toBe(true);
    overlay.destroy();
  });
});
