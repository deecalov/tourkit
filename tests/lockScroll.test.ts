import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountTour } from "./helpers";

const html = () => document.documentElement;
const locked = () => html().style.overflow === "hidden";

describe("lockScroll", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    html().style.overflow = "";
    html().style.paddingRight = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("freezes the page while the tour runs and restores on exit", async () => {
    const tour = mountTour({ lockScroll: true, steps: [{ content: "one" }] });

    await tour.start();
    expect(locked()).toBe(true);

    await tour.exit(true);
    expect(locked()).toBe(false);
  });

  it("is off by default", async () => {
    const tour = mountTour({ steps: [{ content: "one" }] });
    await tour.start();
    expect(locked()).toBe(false);
  });

  it("restores the previous inline overflow rather than clearing it", async () => {
    html().style.overflow = "clip";
    const tour = mountTour({ lockScroll: true, steps: [{ content: "one" }] });

    await tour.start();
    expect(locked()).toBe(true);

    await tour.exit(true);
    expect(html().style.overflow).toBe("clip");
  });

  it("compensates for the scrollbar width so the layout does not jump", async () => {
    // jsdom reports 0 for both, so fake a 15px classic scrollbar.
    vi.stubGlobal("innerWidth", 1015);
    vi.spyOn(html(), "clientWidth", "get").mockReturnValue(1000);

    const tour = mountTour({ lockScroll: true, steps: [{ content: "one" }] });
    await tour.start();

    expect(html().style.paddingRight).toBe("15px");

    await tour.exit(true);
    expect(html().style.paddingRight).toBe("");
  });

  it("does not compensate when the page reserves the gutter (scrollbar-gutter: stable)", async () => {
    vi.stubGlobal("innerWidth", 1015);
    vi.spyOn(html(), "clientWidth", "get").mockReturnValue(1000);
    html().style.setProperty("scrollbar-gutter", "stable");

    const tour = mountTour({ lockScroll: true, steps: [{ content: "one" }] });
    await tour.start();

    // The gutter stays reserved under overflow: hidden — extra padding would
    // shift the layout by the scrollbar width in the other direction.
    expect(locked()).toBe(true);
    expect(html().style.paddingRight).toBe("");

    await tour.exit(true);
    html().style.removeProperty("scrollbar-gutter");
  });

  it("follows a per-step override in both directions", async () => {
    const tour = mountTour({
      steps: [{ content: "free" }, { content: "locked", lockScroll: true }, { content: "free" }],
    });

    await tour.start();
    expect(locked()).toBe(false);

    await tour.next();
    expect(locked()).toBe(true);

    await tour.next();
    expect(locked()).toBe(false);
  });

  it("releases the lock on destroy()", async () => {
    const tour = mountTour({ lockScroll: true, steps: [{ content: "one" }] });
    await tour.start();
    expect(locked()).toBe(true);

    tour.destroy();
    expect(locked()).toBe(false);
  });

  it("can be toggled live through setOptions", async () => {
    const tour = mountTour({ steps: [{ content: "one" }] });
    await tour.start();
    expect(locked()).toBe(false);

    tour.setOptions({ lockScroll: true });
    await vi.waitFor(() => expect(locked()).toBe(true));

    tour.setOptions({ lockScroll: false });
    await vi.waitFor(() => expect(locked()).toBe(false));
  });
});
