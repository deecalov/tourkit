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
});
