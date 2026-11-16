// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTarget } from "../src/core/engine";
import { createHints, fromHintAttributes } from "../src/hints";
import { injectStyles } from "../src/styles/inject";
import { bindTriggers } from "../src/tour/triggers";
import { createTour } from "../src/tour/tour";
import { fromDataAttributes } from "../src/tour/steps";
import { highlight } from "../src/tour/highlight";

/**
 * Importing and configuring TourKit on a server must never throw: every
 * entry point degrades to a warning and an inert value. Anything touching
 * `document` at call time (rather than inside `start()`) would crash a
 * Next.js/Nuxt render.
 */
describe("server-side rendering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const warn = () => vi.spyOn(console, "warn").mockImplementation(() => {});

  it("has no document in this environment", () => {
    expect(typeof document).toBe("undefined");
  });

  it("createTour().start() warns and resolves to false", async () => {
    const spy = warn();
    const tour = createTour({ steps: [{ content: "x" }] });

    expect(await tour.start()).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("outside the browser"));
    expect(tour.isActive).toBe(false);
  });

  it("highlight() returns an inert handle", () => {
    const spy = warn();
    const spot = highlight("#anything");

    expect(spot.isActive).toBe(false);
    expect(() => {
      spot.move("#other");
      spot.refresh();
      spot.destroy();
    }).not.toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("outside the browser"));
  });

  it("bindTriggers() returns a no-op unbind", () => {
    const spy = warn();
    const unbind = bindTriggers();

    expect(() => unbind()).not.toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("outside the browser"));
  });

  it("the scanners return nothing instead of dereferencing document", () => {
    const spy = warn();

    expect(fromDataAttributes()).toEqual([]);
    expect(fromHintAttributes()).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("createHints().render() is a no-op", () => {
    const hints = createHints({ hints: [{ target: "#x", content: "y" }] });
    expect(() => hints.render()).not.toThrow();
    expect(hints.hints).toEqual([]);
    expect(hints.add({ target: "#x", content: "y" })).toBe(-1);
  });

  it("injectStyles() returns a cleanup that does nothing", () => {
    expect(() => injectStyles()()).not.toThrow();
  });

  it("resolveTarget() yields null for selectors without a document", () => {
    expect(resolveTarget("#missing")).toBeNull();
    expect(resolveTarget(undefined)).toBeNull();
  });
});
