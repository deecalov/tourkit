import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindTriggers } from "../src/tour/triggers";
import {
  DEFAULT_DATA_ATTRIBUTE,
  fromDataAttributes,
  resolveDataAttribute,
} from "../src/tour/steps";
import { mountTour } from "./helpers";

/**
 * `data-tour` is a generic name. A page that already uses it for its own
 * anchors would otherwise have its markup silently turned into a tour.
 */
describe("configurable data attribute", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("resolveDataAttribute", () => {
    it("falls back to data-tour and accepts valid custom names", () => {
      expect(resolveDataAttribute()).toBe(DEFAULT_DATA_ATTRIBUTE);
      expect(resolveDataAttribute("data-guide")).toBe("data-guide");
      expect(resolveDataAttribute("data-tk-step")).toBe("data-tk-step");
    });

    it("rejects names that are not data attributes", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      for (const invalid of ["guide", "tour", "data-", "data-Guide", "data-guide-"]) {
        expect(resolveDataAttribute(invalid), invalid).toBe(DEFAULT_DATA_ATTRIBUTE);
      }
      expect(warn).toHaveBeenCalledTimes(5);
      warn.mockRestore();
    });
  });

  it("scans the whole family under the custom base name", () => {
    document.body.innerHTML = `
      <div data-guide="Custom scanner"
           data-guide-title="Custom"
           data-guide-placement="top-end"
           data-guide-no-interaction
           data-guide-lock-scroll
           data-guide-highlight="#a, #b"
           data-guide-wait="500"
           data-guide-advance-on="mouseenter"></div>
    `;

    const [step] = fromDataAttributes(document, { attribute: "data-guide" });

    expect(step).toMatchObject({
      content: "Custom scanner",
      title: "Custom",
      placement: "top-end",
      disableInteraction: true,
      lockScroll: true,
      highlight: ["#a", "#b"],
      waitForTarget: { timeoutMs: 500 },
      advanceOn: { event: "mouseenter" },
    });
  });

  it("ignores markup written with the default name", () => {
    document.body.innerHTML = `<div data-tour="Host's own anchor"></div>`;

    expect(fromDataAttributes(document, { attribute: "data-guide" })).toEqual([]);
    expect(fromDataAttributes(document)).toHaveLength(1);
  });

  it("filters groups with the custom name too", () => {
    document.body.innerHTML = `
      <div data-guide="in" data-guide-group="a"></div>
      <div data-guide="out" data-guide-group="b"></div>
    `;

    const steps = fromDataAttributes(document, { attribute: "data-guide", group: "a" });

    expect(steps).toHaveLength(1);
    expect(steps[0]?.content).toBe("in");
  });

  it("createTour({ dataAttribute }) leaves the host's data-tour alone", async () => {
    document.body.innerHTML = `
      <div data-tour="Host anchor, not a step"></div>
      <div data-guide="Real step" data-guide-title="Real"></div>
    `;

    const tour = mountTour({ dataAttribute: "data-guide" });
    await tour.start();

    expect(tour.steps).toHaveLength(1);
    expect(document.querySelector(".tk-tooltip__title")?.textContent).toBe("Real");
  });

  it("bindTriggers renames the trigger attribute as well", async () => {
    document.body.innerHTML = `
      <button id="go" data-guide-trigger></button>
      <div data-guide="Scanned step" data-guide-title="Scanned"></div>
      <button id="stale" data-tour-trigger></button>
    `;
    const unbind = bindTriggers(document, { dataAttribute: "data-guide" });

    document.getElementById("stale")!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.querySelector(".tk-root")).toBeNull();

    document.getElementById("go")!.click();
    await vi.waitFor(() => expect(document.querySelector(".tk-tooltip__title")).not.toBeNull());
    expect(document.querySelector(".tk-tooltip__title")?.textContent).toBe("Scanned");

    unbind();
  });
});
