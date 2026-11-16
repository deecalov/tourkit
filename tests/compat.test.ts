import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fromIntroDataAttributes,
  introJs,
  mapIntroHintPosition,
  mapIntroOptions,
  mapIntroPosition,
} from "../src/compat/introjs";

describe("mapIntroPosition", () => {
  it("maps aligned intro.js positions to Side-Align", () => {
    expect(mapIntroPosition("bottom-left-aligned")).toBe("bottom-start");
    expect(mapIntroPosition("bottom-middle-aligned")).toBe("bottom");
    expect(mapIntroPosition("top-right-aligned")).toBe("top-end");
    expect(mapIntroPosition("floating")).toBe("center");
    expect(mapIntroPosition("left")).toBe("left");
    expect(mapIntroPosition(null)).toBeUndefined();
  });
});

describe("mapIntroHintPosition", () => {
  it("maps intro.js hint anchors", () => {
    expect(mapIntroHintPosition("top-middle")).toBe("top-center");
    expect(mapIntroHintPosition("middle-right")).toBe("middle-end");
    expect(mapIntroHintPosition("bottom-left")).toBe("bottom-start");
  });
});

describe("mapIntroOptions", () => {
  it("maps the full option surface", () => {
    const mapped = mapIntroOptions({
      nextLabel: "Continue",
      prevLabel: "Previous",
      doneLabel: "Finish",
      stepNumbersOfLabel: "out of",
      hidePrev: true,
      nextToDone: false,
      tooltipPosition: "top-right-aligned",
      showBullets: false,
      showProgress: true,
      keyboardNavigation: false,
      exitOnOverlayClick: false,
      overlayOpacity: 0.7,
      helperElementPadding: 12,
      scrollToElement: false,
      tooltipClass: "custom",
      tooltipRenderAsHtml: true,
      dontShowAgain: true,
      dontShowAgainCookie: "seen-key",
      steps: [{ element: "#a", intro: "Text", title: "T", position: "bottom-right-aligned" }],
    });

    expect(mapped.labels).toMatchObject({ next: "Continue", back: "Previous", done: "Finish" });
    expect(mapped.labels?.stepOf).toBe("{step} out of {total}");
    expect(mapped.buttons).toMatchObject({ hideBackOnFirst: true, doneOnLast: false });
    expect(mapped.placement).toBe("top-end");
    expect(mapped.bullets).toBe(false);
    expect(mapped.progress).toBe(true);
    expect(mapped.keyboard).toBe(false);
    expect(mapped.overlay).toMatchObject({ clickToExit: false, opacity: 0.7, padding: 12 });
    expect(mapped.scroll).toMatchObject({ block: "off" });
    expect(mapped.classes).toMatchObject({ tooltip: "custom" });
    expect(mapped.allowHTML).toBe(true);
    expect(mapped.showOnce).toEqual({ key: "seen-key", checkbox: true });
    expect(mapped.steps?.[0]).toMatchObject({
      target: "#a",
      content: "Text",
      title: "T",
      placement: "bottom-end",
    });
  });

  it("hideNext hides Next and Done on the last step only", () => {
    const mapped = mapIntroOptions({ hideNext: true, nextToDone: true });
    expect(mapped.buttons).toMatchObject({ hideNextOnLast: true, doneOnLast: false });
    // The Next button itself stays enabled on intermediate steps.
    expect(mapped.buttons?.next).toBeUndefined();
  });

  it("allowHTML defaults to true (intro.js contract) unless explicitly disabled", () => {
    expect(mapIntroOptions({}).allowHTML).toBe(true);
    expect(mapIntroOptions({ tooltipRenderAsHtml: false }).allowHTML).toBe(false);
  });
});

describe("fromIntroDataAttributes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("scans data-intro attributes with slots and groups", () => {
    document.body.innerHTML = `
      <div data-intro="third" data-step="3"></div>
      <div data-intro="first" data-step="1" data-title="T" data-position="right"></div>
      <div data-intro="second" data-intro-group="g"></div>
    `;

    const all = fromIntroDataAttributes();
    expect(all.map((s) => s.content)).toEqual(["first", "second", "third"]);
    expect(all[0]).toMatchObject({ title: "T", placement: "right" });

    const grouped = fromIntroDataAttributes(document, "g");
    expect(grouped.map((s) => s.content)).toEqual(["second"]);
  });
});

describe("introJs compat facade", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("runs a tour with intro.js-style options and 1-based goToStep", async () => {
    const done = vi.fn();
    const compat = introJs
      .tour()
      .setOptions({
        steps: [{ intro: "one" }, { intro: "two" }, { intro: "three" }],
      })
      .oncomplete(done);

    await compat.start();
    expect(compat.getCurrentStep()).toBe(0);

    await compat.goToStep(3); // 1-based → index 2
    expect(compat.getCurrentStep()).toBe(2);

    await compat.nextStep(); // completes programmatically → intro.js reason "end"
    await vi.waitFor(() => expect(compat.isActive()).toBe(false), { timeout: 2000 });
    expect(done).toHaveBeenCalledWith(2, "end");
  });

  it("onbeforechange returning false blocks forward navigation only", async () => {
    const compat = introJs
      .tour()
      .setOptions({ steps: [{ intro: "one" }, { intro: "two" }] })
      .onbeforechange((_el, to) => (to as number) !== 1); // block entering the second step

    await compat.start();
    await compat.nextStep();
    expect(compat.getCurrentStep()).toBe(0);

    await compat.exit(true);
  });

  it("isActive false makes start a no-op", async () => {
    const compat = introJs.tour().setOptions({ isActive: false, steps: [{ intro: "x" }] });
    await compat.start();
    expect(document.querySelector(".tk-root")).toBeNull();
  });

  it("nextStep() past the last step reports 'end', Done click reports 'done'", async () => {
    const done = vi.fn();
    const compat = introJs
      .tour()
      .setOptions({ steps: [{ intro: "only" }] })
      .oncomplete(done);

    await compat.start();
    await compat.nextStep(); // programmatic
    await vi.waitFor(() => expect(compat.isActive()).toBe(false), { timeout: 2000 });
    expect(done).toHaveBeenCalledWith(0, "end");

    done.mockClear();
    await compat.start();
    document.querySelector<HTMLButtonElement>('[data-tk-action="done"]')!.click();
    await vi.waitFor(() => expect(compat.isActive()).toBe(false), { timeout: 2000 });
    expect(done).toHaveBeenCalledWith(0, "done");
  });

  it("closing mid-tour fires onskip and onexit but not oncomplete", async () => {
    const complete = vi.fn();
    const skip = vi.fn();
    const exit = vi.fn();
    const compat = introJs
      .tour()
      .setOptions({ steps: [{ intro: "one" }, { intro: "two" }] })
      .oncomplete(complete)
      .onskip(skip)
      .onexit(exit);

    await compat.start();
    document.querySelector<HTMLButtonElement>(".tk-tooltip__close")!.click();
    await vi.waitFor(() => expect(compat.isActive()).toBe(false), { timeout: 2000 });

    expect(skip).toHaveBeenCalledWith(0);
    expect(exit).toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("skip on the last step fires oncomplete with 'skip'", async () => {
    const complete = vi.fn();
    const compat = introJs
      .tour()
      .setOptions({ steps: [{ intro: "one" }, { intro: "two" }] })
      .oncomplete(complete);

    await compat.start();
    await compat.goToStep(2);
    document.querySelector<HTMLButtonElement>(".tk-tooltip__close")!.click();
    await vi.waitFor(() => expect(compat.isActive()).toBe(false), { timeout: 2000 });

    expect(complete).toHaveBeenCalledWith(1, "skip");
  });

  it("repeated start() exits the previous tour instead of running two", async () => {
    const compat = introJs.tour().setOptions({ steps: [{ intro: "one" }, { intro: "two" }] });

    await compat.start();
    await compat.start();
    await vi.waitFor(() => expect(document.querySelectorAll(".tk-root")).toHaveLength(1), {
      timeout: 2000,
    });

    await compat.exit(true);
  });

  it("goToStepNumber targets the explicit data-step number", async () => {
    document.body.innerHTML = `
      <div data-intro="five" data-step="5"></div>
      <div data-intro="unnumbered"></div>
    `;
    const compat = introJs.tour();
    await compat.start();

    // Order: slot 1 (unnumbered), then overflow data-step=5.
    await compat.goToStepNumber(5);
    expect(compat.getCurrentStep()).toBe(1);

    await compat.goToStepNumber(99); // unknown number → no-op
    expect(compat.getCurrentStep()).toBe(1);

    await compat.exit(true);
  });

  it("exposes getOption/getSteps/getStep/clone/setDontShowAgain", async () => {
    localStorage.clear();
    const compat = introJs
      .tour()
      .setOptions({ nextLabel: "N", steps: [{ intro: "a", element: "#x" }] });

    expect(compat.getOption("nextLabel")).toBe("N");
    expect(compat.getOptions()["nextLabel"]).toBe("N");
    expect(compat.getSteps()).toHaveLength(1);
    expect(compat.getStep(0)).toMatchObject({ intro: "a" });

    const copy = compat.clone();
    expect(copy).not.toBe(compat);
    expect(copy.getOption("nextLabel")).toBe("N");

    compat.setDontShowAgain(true);
    expect(localStorage.getItem("tk-dont-show-again")).toBe("1");
    compat.setDontShowAgain(false);
    expect(localStorage.getItem("tk-dont-show-again")).toBeNull();
  });

  it("renders step content as HTML by default (intro.js contract)", async () => {
    const compat = introJs.tour().setOptions({ steps: [{ intro: "<em>rich</em>" }] });
    await compat.start();

    expect(document.querySelector(".tk-tooltip__content em")).not.toBeNull();
    await compat.exit(true);
  });
});
