// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPlacement, parsePlacement, resolvePlacement } from "../src/geometry/placement";
import type { Rect } from "../src/geometry/rect";

const viewport: Rect = { x: 0, y: 0, width: 1000, height: 800 };
const tooltip = { width: 300, height: 150 };
const precedence: Array<"top" | "bottom" | "left" | "right"> = ["bottom", "top", "right", "left"];

const resolve = (desired: Parameters<typeof resolvePlacement>[0], target: Rect | null) =>
  resolvePlacement(desired, target, tooltip, viewport, precedence, {
    gap: 14,
    viewportPadding: 8,
    arrowInset: 14,
  });

describe("parsePlacement", () => {
  it("splits side and alignment", () => {
    expect(parsePlacement("bottom-start")).toEqual({ side: "bottom", align: "start" });
    expect(parsePlacement("top")).toEqual({ side: "top", align: undefined });
    expect(parsePlacement("center")).toEqual({ side: "center", align: undefined });
  });
});

describe("isPlacement", () => {
  it("accepts every side, alignment and center", () => {
    for (const value of ["center", "top", "bottom", "left", "right", "top-start", "right-end"]) {
      expect(isPlacement(value), value).toBe(true);
    }
  });

  it("rejects typos and non-strings", () => {
    for (const value of ["diagonal", "top-middle", "TOP", "", null, undefined]) {
      expect(isPlacement(value), String(value)).toBe(false);
    }
  });
});

describe("resolvePlacement", () => {
  it("keeps the desired side when it fits", () => {
    const target: Rect = { x: 400, y: 300, width: 100, height: 40 };
    const r = resolve("bottom", target);

    expect(r.side).toBe("bottom");
    expect(r.y).toBe(300 + 40 + 14);
    // centered horizontally against the target
    expect(r.x).toBe(400 + (100 - 300) / 2);
  });

  it("flips to the first fitting side from precedence", () => {
    // Target at the very bottom: no room below, must flip to top.
    const target: Rect = { x: 400, y: 700, width: 100, height: 80 };
    const r = resolve("bottom", target);

    expect(r.side).toBe("top");
    expect(r.y).toBe(700 - 14 - 150);
  });

  it("falls back to center when nothing fits", () => {
    // A huge target occupying nearly the whole viewport.
    const target: Rect = { x: 10, y: 10, width: 980, height: 780 };
    const r = resolve("bottom", target);

    expect(r.side).toBe("center");
    expect(r.arrow).toBeNull();
    expect(r.x).toBe((1000 - 300) / 2);
    expect(r.y).toBe((800 - 150) / 2);
  });

  it("shifts the cross axis into the viewport", () => {
    // Target hugs the left edge; centered alignment would push x negative.
    const target: Rect = { x: 0, y: 300, width: 40, height: 40 };
    const r = resolve("bottom", target);

    expect(r.side).toBe("bottom");
    expect(r.x).toBe(8); // clamped to viewportPadding
  });

  it("respects explicit alignment", () => {
    const target: Rect = { x: 400, y: 300, width: 100, height: 40 };

    expect(resolve("bottom-start", target).x).toBe(400);
    expect(resolve("bottom-end", target).x).toBe(400 + 100 - 300);
  });

  it("returns center for steps without a target", () => {
    const r = resolve("bottom", null);
    expect(r.side).toBe("center");
    expect(r.arrow).toBeNull();
  });

  it("honors an explicit center placement even with a target", () => {
    const target: Rect = { x: 400, y: 300, width: 100, height: 40 };
    const r = resolve("center", target);
    expect(r.side).toBe("center");
  });

  it("points the arrow at the target center and clamps it near corners", () => {
    const target: Rect = { x: 400, y: 300, width: 100, height: 40 };
    const centered = resolve("bottom", target);
    // Arrow offset is relative to the tooltip's left edge.
    expect(centered.arrow).toBe(400 + 50 - centered.x);

    // Target at the far left: tooltip is clamped, arrow must not enter the corner.
    const edge: Rect = { x: 0, y: 300, width: 20, height: 20 };
    const clamped = resolve("bottom", edge);
    expect(clamped.arrow).toBe(14); // arrowInset
  });

  it("positions left/right sides on the cross axis vertically", () => {
    const target: Rect = { x: 500, y: 400, width: 60, height: 60 };
    const r = resolve("right", target);

    expect(r.side).toBe("right");
    expect(r.x).toBe(500 + 60 + 14);
    expect(r.y).toBe(400 + (60 - 150) / 2);
  });

  it("uses precedence order when the desired side lacks space", () => {
    // No room on the right → precedence says bottom first.
    const target: Rect = { x: 850, y: 100, width: 140, height: 40 };
    const r = resolve("right", target);

    expect(r.side).toBe("bottom");
  });

  it("mirrors start/end alignments in RTL for vertical sides", () => {
    const target: Rect = { x: 400, y: 300, width: 100, height: 40 };
    const rtl = (desired: Parameters<typeof resolvePlacement>[0]) =>
      resolvePlacement(desired, target, tooltip, viewport, precedence, {
        gap: 14,
        viewportPadding: 8,
        arrowInset: 14,
        rtl: true,
      });

    // start in RTL behaves like end in LTR and vice versa
    expect(rtl("bottom-start").x).toBe(400 + 100 - 300);
    expect(rtl("bottom-end").x).toBe(400);
    // center and horizontal sides are unaffected
    expect(rtl("bottom").x).toBe(400 + (100 - 300) / 2);
    expect(rtl("right").y).toBe(300 + (40 - 150) / 2);
  });
});
