import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlacement } from "../src/geometry/placement";
import { css } from "../src/styles/css.generated";
import { bindTriggers } from "../src/tour/triggers";
import { mountTour } from "./helpers";

/**
 * One test per defect from docs/tourkit-v0.6-audit.md so a regression is
 * reported as the defect it revives, not as a vague layout failure.
 */
describe("D1: the tooltip always fits the viewport", () => {
  const viewport = { x: 0, y: 0, width: 1000, height: 400 };

  it("clamps a floating tooltip taller than the viewport", () => {
    const resolved = resolvePlacement("center", null, { width: 300, height: 900 }, viewport, [
      "bottom",
    ]);

    expect(resolved.side).toBe("center");
    expect(resolved.y).toBe(8); // viewportPadding, not a negative offset
    expect(resolved.x).toBe((1000 - 300) / 2);
  });

  it("clamps a tooltip wider than the viewport", () => {
    const resolved = resolvePlacement("center", null, { width: 1400, height: 100 }, viewport, [
      "bottom",
    ]);

    expect(resolved.x).toBe(8);
  });

  it("still centers when there is room", () => {
    const resolved = resolvePlacement("center", null, { width: 300, height: 100 }, viewport, [
      "bottom",
    ]);

    expect(resolved.x).toBe(350);
    expect(resolved.y).toBe(150);
  });

  it("caps the tooltip height in CSS and scrolls the content", () => {
    // Matching on rule blocks rather than the whole sheet keeps a failure
    // readable: `css` is ~15 KB and would be dumped verbatim otherwise.
    const rule = (selector: string) =>
      css.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))?.[0] ?? "";

    expect(rule(".tk-tooltip ")).toContain("max-height");
    expect(rule(".tk-tooltip__content")).toContain("overflow-y: auto");
  });
});

describe("D2: bindTriggers cleans up after itself", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const markup = () => {
    document.body.innerHTML = `
      <button id="trigger" data-tour-trigger></button>
      <div id="step" data-tour="Step one"></div>
    `;
  };

  it("unbind() tears down the tour it started", async () => {
    markup();
    const unbind = bindTriggers();

    document.getElementById("trigger")!.click();
    await vi.waitFor(() => expect(document.querySelector(".tk-root")).not.toBeNull());

    unbind();
    expect(document.querySelector(".tk-root")).toBeNull();
  });

  it("unbind() stops handling further clicks", async () => {
    markup();
    const unbind = bindTriggers();
    unbind();

    document.getElementById("trigger")!.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector(".tk-root")).toBeNull();
  });
});

describe("D3: bindTriggers scans inside the given root", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ignores [data-tour] elements outside the root", async () => {
    document.body.innerHTML = `
      <div id="outside" data-tour="Outside" data-tour-title="Outside"></div>
      <section id="widget">
        <button id="trigger" data-tour-trigger></button>
        <div data-tour="Inside" data-tour-title="Inside"></div>
      </section>
    `;
    const unbind = bindTriggers(document.getElementById("widget")!);

    document.getElementById("trigger")!.click();
    await vi.waitFor(() => expect(document.querySelector(".tk-tooltip")).not.toBeNull());

    expect(document.querySelector(".tk-tooltip__title")?.textContent).toBe("Inside");
    expect(document.querySelectorAll(".tk-tooltip__bullet")).toHaveLength(0); // a single step

    unbind();
  });
});

describe("D8: two tours at once are reported", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("warns when a second tour starts on top of a running one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = mountTour({ steps: [{ content: "one" }] });
    await first.start();
    expect(warn).not.toHaveBeenCalled();

    const second = mountTour({ steps: [{ content: "two" }] });
    await second.start();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("another tour is already running"));
    warn.mockRestore();
  });

  it("stays quiet once the previous tour has exited", async () => {
    const first = mountTour({ steps: [{ content: "one" }] });
    await first.start();
    await first.exit(true);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const second = mountTour({ steps: [{ content: "two" }] });
    await second.start();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("D9: a throwing callback cannot strand the tour", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps navigating when a stepChange handler throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const tour = mountTour({ steps: [{ content: "one" }, { content: "two" }] });

    tour.on("stepChange", () => {
      throw new Error("analytics is down");
    });

    await tour.start();
    await tour.next();

    expect(tour.index).toBe(1);
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("two");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("stepChange"), expect.any(Error));
    error.mockRestore();
  });

  it("shows the step when onBeforeShow throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const tour = mountTour({
      steps: [
        {
          content: "one",
          onBeforeShow: () => {
            throw new Error("boom");
          },
        },
      ],
    });

    expect(await tour.start()).toBe(true);
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("one");
    error.mockRestore();
  });

  it("keeps the tooltip usable when renderStep throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const tour = mountTour({
      steps: [
        {
          content: "one",
          renderStep: () => {
            throw new Error("render failed");
          },
        },
      ],
    });

    await tour.start();

    expect(document.querySelector(".tk-tooltip__footer")).not.toBeNull();
    expect(error).toHaveBeenCalledWith("[tourkit] renderStep failed", expect.any(Error));
    error.mockRestore();
  });

  it("survives a throwing renderStep cleanup", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const tour = mountTour({
      steps: [
        {
          content: "one",
          renderStep: () => () => {
            throw new Error("cleanup failed");
          },
        },
        { content: "two" },
      ],
    });

    await tour.start();
    await tour.next();

    expect(tour.index).toBe(1);
    error.mockRestore();
  });
});

describe("misc: duplicate step slots are reported", () => {
  it("warns when two elements claim the same data-tour-step", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `
      <div data-tour="first" data-tour-step="1"></div>
      <div data-tour="second" data-tour-step="1"></div>
    `;

    const tour = mountTour();
    await tour.start();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate data-tour-step="1"'));
    warn.mockRestore();
  });
});
