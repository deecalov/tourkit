import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultOptions } from "../src/core/options";
import { fromDataAttributes, normalizeSteps } from "../src/tour/steps";

describe("normalizeSteps", () => {
  it("applies tour-level defaults", () => {
    const options = getDefaultOptions();
    const [withTarget, floating] = normalizeSteps(
      [{ target: "#x", content: "a" }, { content: "b" }],
      options
    );

    expect(withTarget!.placement).toBe("bottom");
    expect(withTarget!.disableInteraction).toBe(false);
    expect(floating!.placement).toBe("center");
  });

  it("keeps explicit per-step values", () => {
    const options = getDefaultOptions();
    const [step] = normalizeSteps(
      [{ target: "#x", content: "a", placement: "top-end", disableInteraction: true }],
      options
    );

    expect(step!.placement).toBe("top-end");
    expect(step!.disableInteraction).toBe(true);
  });

  it("drops steps without content", () => {
    const steps = normalizeSteps([{ content: "" }, { content: "ok" }], getDefaultOptions());
    expect(steps).toHaveLength(1);
  });

  it("resolves lockScroll from the tour default and per-step override", () => {
    const options = { ...getDefaultOptions(), lockScroll: true };
    const [inherits, off] = normalizeSteps(
      [{ content: "a" }, { content: "b", lockScroll: false }],
      options
    );

    expect(inherits!.lockScroll).toBe(true);
    expect(off!.lockScroll).toBe(false);
  });

  it("resolves waitForTarget from the tour default and per-step override", () => {
    const options = getDefaultOptions();
    const [inherits, disabled, custom] = normalizeSteps(
      [
        { target: "#a", content: "a" },
        { target: "#b", content: "b", waitForTarget: false },
        { target: "#c", content: "c", waitForTarget: { onTimeout: "skip" } },
      ],
      options
    );

    expect(inherits!.waitForTarget).toEqual({ timeoutMs: 10000, onTimeout: "float" });
    expect(disabled!.waitForTarget).toBe(false);
    expect(custom!.waitForTarget).toEqual({ timeoutMs: 10000, onTimeout: "skip" });
  });
});

describe("fromDataAttributes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const addEl = (attrs: Record<string, string>, hidden = false) => {
    const el = document.createElement("div");
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value);
    }
    if (hidden) el.style.display = "none";
    document.body.append(el);
    return el;
  };

  it("collects steps in document order", () => {
    addEl({ "data-tour": "first" });
    addEl({ "data-tour": "second" });

    const steps = fromDataAttributes();

    expect(steps.map((s) => s.content)).toEqual(["first", "second"]);
  });

  it("respects explicit slot numbers and fills the gaps", () => {
    addEl({ "data-tour": "third", "data-tour-step": "3" });
    addEl({ "data-tour": "first", "data-tour-step": "1" });
    addEl({ "data-tour": "second" }); // takes the free slot 2

    const steps = fromDataAttributes();

    expect(steps.map((s) => s.content)).toEqual(["first", "second", "third"]);
  });

  it("keeps sparse explicit numbers in relative order", () => {
    addEl({ "data-tour": "five", "data-tour-step": "5" });
    addEl({ "data-tour": "two", "data-tour-step": "2" });

    const steps = fromDataAttributes();

    expect(steps.map((s) => s.content)).toEqual(["two", "five"]);
  });

  it("skips hidden elements", () => {
    addEl({ "data-tour": "visible" });
    addEl({ "data-tour": "hidden" }, true);

    const steps = fromDataAttributes();

    expect(steps.map((s) => s.content)).toEqual(["visible"]);
  });

  it("skips visibility:hidden elements", () => {
    addEl({ "data-tour": "visible" });
    const ghost = addEl({ "data-tour": "invisible" });
    ghost.style.visibility = "hidden";

    const steps = fromDataAttributes();

    expect(steps.map((s) => s.content)).toEqual(["visible"]);
  });

  it("filters by group when requested", () => {
    addEl({ "data-tour": "a", "data-tour-group": "billing" });
    addEl({ "data-tour": "b", "data-tour-group": "onboarding" });
    addEl({ "data-tour": "c" });

    expect(fromDataAttributes(document, { group: "billing" }).map((s) => s.content)).toEqual(["a"]);
    expect(fromDataAttributes().map((s) => s.content)).toEqual(["a", "b", "c"]);
  });

  it("parses advanceOn, wait, highlight and lock-scroll attributes", () => {
    document.body.innerHTML = `
      <div id="a"
        data-tour="one"
        data-tour-advance-on
        data-tour-wait="500"
        data-tour-lock-scroll
        data-tour-highlight="#x, #y"></div>
      <div id="b" data-tour="two" data-tour-advance-on="mouseenter" data-tour-wait="false"></div>
      <div id="c" data-tour="three" data-tour-wait></div>
    `;

    const [first, second, third] = fromDataAttributes(document);

    expect(first?.advanceOn).toBe(true);
    expect(first?.waitForTarget).toEqual({ timeoutMs: 500 });
    expect(first?.lockScroll).toBe(true);
    expect(first?.highlight).toEqual(["#x", "#y"]);

    expect(second?.advanceOn).toEqual({ event: "mouseenter" });
    expect(second?.waitForTarget).toBe(false);

    expect(third?.waitForTarget).toEqual({});
    expect(third?.advanceOn).toBeUndefined();
    expect(third?.lockScroll).toBeUndefined();
  });

  it("warns and falls back on an unknown placement or wait value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `
      <div data-tour="one" data-tour-placement="diagonal" data-tour-wait="soon"></div>
    `;

    const [step] = fromDataAttributes(document);

    expect(step?.placement).toBeUndefined();
    expect(step?.waitForTarget).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("parses title, placement and no-interaction attributes", () => {
    const el = addEl({
      "data-tour": "content",
      "data-tour-title": "Title",
      "data-tour-placement": "top-start",
      "data-tour-no-interaction": "",
    });

    const [step] = fromDataAttributes();

    expect(step!.target).toBe(el);
    expect(step!.title).toBe("Title");
    expect(step!.placement).toBe("top-start");
    expect(step!.disableInteraction).toBe(true);
  });
});
