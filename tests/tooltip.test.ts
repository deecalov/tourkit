import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultOptions } from "../src/core/options";
import type { Step, StepContext } from "../src/core/types";
import { TooltipView } from "../src/ui/tooltip";

const noopCallbacks = {
  onNext: () => {},
  onBack: () => {},
  onSkip: () => {},
  onBullet: () => {},
  isShowOnceChecked: () => false,
  onShowOnceChange: () => {},
};

const makeStep = (overrides: Partial<Step> = {}): Step => ({
  content: "content",
  placement: "bottom",
  disableInteraction: false,
  lockScroll: false,
  waitForTarget: false,
  ...overrides,
});

const ctxFor = (step: Step): StepContext => ({ index: 0, step, target: null });

describe("TooltipView position dirty-check", () => {
  let tooltip: TooltipView;

  beforeEach(() => {
    tooltip = new TooltipView(getDefaultOptions(), noopCallbacks);
    document.body.append(tooltip.el);
  });

  it("skips DOM writes when the resolved placement is unchanged", () => {
    const anchor = { x: 100, y: 100, width: 50, height: 30 };
    tooltip.render(ctxFor(makeStep()), 3);
    tooltip.position(anchor);

    // Corrupt an output the write phase owns; a clean resync must not touch it.
    tooltip.el.style.left = "-1234px";
    tooltip.position({ ...anchor });
    expect(tooltip.el.style.left).toBe("-1234px");

    // A moved anchor repositions immediately.
    tooltip.position({ ...anchor, x: 140 });
    expect(tooltip.el.style.left).not.toBe("-1234px");

    tooltip.destroy();
  });

  it("re-applies the side class after render() even for identical geometry", () => {
    const anchor = { x: 100, y: 100, width: 50, height: 30 };
    tooltip.render(ctxFor(makeStep()), 3);
    tooltip.position(anchor);
    const side = [...tooltip.el.classList].find((c) => c.startsWith("tk-tooltip--"));
    expect(side).toBeTruthy();

    // render() rewrites className (dropping the side modifier); the next
    // position() with the same anchor must restore it, not dirty-skip it.
    tooltip.render(ctxFor(makeStep()), 3);
    expect([...tooltip.el.classList]).not.toContain(side);
    tooltip.position(anchor);
    expect([...tooltip.el.classList]).toContain(side);

    tooltip.destroy();
  });

  it("accepts pre-measured size and viewport (batched read phase)", () => {
    tooltip.render(ctxFor(makeStep({ placement: "center" })), 1);
    tooltip.position(null, {
      size: { width: 200, height: 100 },
      viewport: { x: 0, y: 0, width: 1000, height: 600 },
    });

    expect(tooltip.el.style.left).toBe("400px"); // (1000 - 200) / 2
    expect(tooltip.el.style.top).toBe("250px"); // (600 - 100) / 2
    tooltip.destroy();
  });
});

describe("TooltipView meta row and arrow", () => {
  it("renders the step number line when stepNumbers is on", () => {
    const options = { ...getDefaultOptions(), stepNumbers: true };
    const tooltip = new TooltipView(options, noopCallbacks);
    document.body.append(tooltip.el);

    tooltip.render({ index: 1, step: makeStep(), target: null }, 4);

    expect(tooltip.el.querySelector(".tk-tooltip__step-number")?.textContent).toBe("2 of 4");

    tooltip.destroy();
  });

  it("omits the step number line by default", () => {
    const tooltip = new TooltipView(getDefaultOptions(), noopCallbacks);
    document.body.append(tooltip.el);

    tooltip.render(ctxFor(makeStep()), 2);

    expect(tooltip.el.querySelector(".tk-tooltip__step-number")).toBeNull();
    tooltip.destroy();
  });

  it("offsets the arrow vertically for side placements", () => {
    const tooltip = new TooltipView(getDefaultOptions(), noopCallbacks);
    document.body.append(tooltip.el);
    tooltip.render(ctxFor(makeStep({ placement: "right" })), 1);

    tooltip.position(
      { x: 20, y: 300, width: 40, height: 40 },
      {
        size: { width: 200, height: 100 },
        viewport: { x: 0, y: 0, width: 1000, height: 800 },
      }
    );

    const arrow = tooltip.el.querySelector<HTMLElement>(".tk-tooltip__arrow")!;
    expect(tooltip.placement?.side).toBe("right");
    expect(arrow.dataset["side"]).toBe("right");
    expect(arrow.style.top).not.toBe("");
    expect(arrow.style.left).toBe("");

    tooltip.destroy();
  });

  it("hides the arrow for a centered step", () => {
    const tooltip = new TooltipView(getDefaultOptions(), noopCallbacks);
    document.body.append(tooltip.el);
    tooltip.render(ctxFor(makeStep({ placement: "center" })), 1);

    tooltip.position(null, {
      size: { width: 200, height: 100 },
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
    });

    const arrow = tooltip.el.querySelector<HTMLElement>(".tk-tooltip__arrow")!;
    expect(arrow.style.display).toBe("none");

    tooltip.destroy();
  });
});

describe("TooltipView boundary button visibility", () => {
  const ghost = () => document.querySelector(".tk-button--ghost");
  const primary = () => document.querySelector(".tk-button--primary");

  it("hideBackOnFirst removes Back on the first step, keeps it later", () => {
    const options = getDefaultOptions();
    options.buttons.hideBackOnFirst = true;
    const tooltip = new TooltipView(options, noopCallbacks);
    document.body.append(tooltip.el);

    tooltip.render({ index: 0, step: makeStep(), target: null }, 3);
    expect(ghost()).toBeNull();

    tooltip.render({ index: 1, step: makeStep(), target: null }, 3);
    expect(ghost()).not.toBeNull();

    tooltip.destroy();
  });

  it("hideNextOnLast removes the disabled Next stub on the last step", () => {
    const options = getDefaultOptions();
    options.buttons.doneOnLast = false;
    options.buttons.hideNextOnLast = true;
    const tooltip = new TooltipView(options, noopCallbacks);
    document.body.append(tooltip.el);

    tooltip.render({ index: 2, step: makeStep(), target: null }, 3);
    expect(primary()).toBeNull();

    tooltip.render({ index: 1, step: makeStep(), target: null }, 3);
    expect(primary()).not.toBeNull();

    tooltip.destroy();
  });

  it("hideNextOnLast keeps Done when doneOnLast is on", () => {
    const options = getDefaultOptions();
    options.buttons.hideNextOnLast = true; // doneOnLast stays true by default
    const tooltip = new TooltipView(options, noopCallbacks);
    document.body.append(tooltip.el);

    tooltip.render({ index: 2, step: makeStep(), target: null }, 3);
    expect(primary()).not.toBeNull();
    expect((primary() as HTMLElement).dataset["tkAction"]).toBe("done");

    tooltip.destroy();
  });
});
