import { beforeEach, describe, expect, it, vi } from "vitest";
import { scrollTargetIntoView } from "../src/geometry/scrollIntoView";

const VIEWPORT = 768; // jsdom default innerHeight

function makeTarget(rect: Partial<DOMRect>) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      bottom: 40,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 0,
      ...rect,
    }) as DOMRect;
  (el as HTMLElement & { scrollIntoView: unknown }).scrollIntoView = vi.fn();
  document.body.append(el);
  return el;
}

describe("scrollTargetIntoView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does nothing when block is 'off'", () => {
    const el = makeTarget({ top: 5000, bottom: 5040 });
    scrollTargetIntoView(el, { block: "off", behavior: "auto", padding: 24 });
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("skips scrolling when the target is already comfortably visible", () => {
    const el = makeTarget({ top: 200, bottom: 240, left: 10, right: 110 });
    scrollTargetIntoView(el, { block: "center", behavior: "auto", padding: 24 });
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls when the target is below the viewport", () => {
    const el = makeTarget({ top: VIEWPORT + 100, bottom: VIEWPORT + 140 });
    scrollTargetIntoView(el, { block: "center", behavior: "auto", padding: 24 });
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
  });

  it("scrolls when the target is closer to the edge than the comfort padding", () => {
    const el = makeTarget({ top: 4, bottom: 44 });
    scrollTargetIntoView(el, { block: "center", behavior: "smooth", padding: 24 });
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("restores the previous inline scroll-margin after scrolling", () => {
    const el = makeTarget({ top: VIEWPORT + 100, bottom: VIEWPORT + 140 });
    el.style.scrollMargin = "5px";

    scrollTargetIntoView(el, { block: "center", behavior: "auto", padding: 24 });

    expect(el.style.scrollMargin).toBe("5px");
  });

  describe("targets clipped by a nested scroll container", () => {
    /** A 200px-tall scroller at y = 50 (visible box 50..250), like a sidebar list. */
    const makeScroller = (overflow: string) => {
      const box = document.createElement("div");
      box.style.overflow = overflow;
      box.getBoundingClientRect = () =>
        ({
          top: 50,
          left: 0,
          bottom: 250,
          right: 300,
          width: 300,
          height: 200,
          x: 0,
          y: 50,
        }) as DOMRect;
      Object.defineProperty(box, "clientHeight", { value: 200 });
      Object.defineProperty(box, "clientWidth", { value: 300 });
      document.body.append(box);
      return box;
    };

    it("scrolls a target that sits inside the viewport but outside its scroller", () => {
      const box = makeScroller("auto");
      const el = makeTarget({ top: 311, bottom: 341, left: 10, right: 110 });
      box.append(el);

      scrollTargetIntoView(el, { block: "center", behavior: "auto", padding: 24 });
      expect(el.scrollIntoView).toHaveBeenCalled();
    });

    it("leaves a target alone that is visible inside its scroller", () => {
      const box = makeScroller("auto");
      const el = makeTarget({ top: 100, bottom: 140, left: 10, right: 110 });
      box.append(el);

      scrollTargetIntoView(el, { block: "center", behavior: "auto", padding: 24 });
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });

    it("does not start scrolling overflow:hidden widgets (carousels) for a visible target", () => {
      const box = makeScroller("hidden");
      const el = makeTarget({ top: 311, bottom: 341, left: 10, right: 110 });
      box.append(el);

      scrollTargetIntoView(el, { block: "center", behavior: "auto", padding: 24 });
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe("the host's own scroll-margin (sticky headers)", () => {
    it("counts a larger scroll-margin-top as part of the comfort zone", () => {
      // 50px from the top: fine for the 24px padding, but the page declared
      // scroll-margin-top: 100px because an 80px sticky header covers it.
      const el = makeTarget({ top: 50, bottom: 90, left: 10, right: 110 });
      el.style.setProperty("scroll-margin-top", "100px");

      scrollTargetIntoView(el, { block: "nearest", behavior: "auto", padding: 24 });
      expect(el.scrollIntoView).toHaveBeenCalled();
    });

    it("scrolls with max(padding, host margin) per side and restores the host's inline value", () => {
      // Longhands are set and restored one by one: restoring through the
      // `scroll-margin` shorthand would wipe an inline `scroll-margin-top`.
      const el = makeTarget({ top: VIEWPORT + 100, bottom: VIEWPORT + 140 });
      el.style.setProperty("scroll-margin-top", "100px");
      const during: string[] = [];
      (el.scrollIntoView as ReturnType<typeof vi.fn>).mockImplementation(() => {
        for (const side of ["top", "right", "bottom", "left"]) {
          during.push(el.style.getPropertyValue(`scroll-margin-${side}`));
        }
      });

      scrollTargetIntoView(el, { block: "nearest", behavior: "auto", padding: 24 });

      expect(during).toEqual(["100px", "24px", "24px", "24px"]);
      expect(el.style.getPropertyValue("scroll-margin-top")).toBe("100px");
      expect(el.style.getPropertyValue("scroll-margin-bottom")).toBe("");
    });
  });
});
