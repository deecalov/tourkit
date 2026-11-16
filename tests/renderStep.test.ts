import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour } from "../src/tour/tour";

describe("renderStep", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("renders custom DOM into the content host", async () => {
    const tour = createTour({
      steps: [
        {
          content: "fallback",
          renderStep: (ctx, host) => {
            const strong = document.createElement("strong");
            strong.textContent = `custom-${ctx.index}`;
            host.append(strong);
          },
        },
      ],
    });

    await tour.start();

    const content = document.querySelector(".tk-tooltip__content")!;
    expect(content.querySelector("strong")?.textContent).toBe("custom-0");
    expect(content.textContent).not.toContain("fallback");

    tour.destroy();
  });

  it("runs cleanup when the step changes and on destroy", async () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();

    const tour = createTour({
      steps: [
        { content: "a", renderStep: () => cleanup1 },
        { content: "b", renderStep: () => cleanup2 },
      ],
    });

    await tour.start();
    expect(cleanup1).not.toHaveBeenCalled();

    await tour.next();
    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(cleanup2).not.toHaveBeenCalled();

    tour.destroy();
    expect(cleanup2).toHaveBeenCalledTimes(1);
  });

  it("keeps steps with empty content when a renderer is provided", async () => {
    const tour = createTour({
      steps: [
        { content: "", renderStep: (_ctx, host) => void (host.textContent = "rendered") },
        { content: "plain" },
        { content: "" }, // no renderer → dropped
      ],
    });

    await tour.start();

    expect(tour.steps).toHaveLength(2);
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("rendered");

    tour.destroy();
  });

  it("tour-level renderStep applies to all steps, per-step wins", async () => {
    const tour = createTour({
      renderStep: (_ctx, host) => {
        host.textContent = "global";
      },
      steps: [
        { content: "x" },
        { content: "y", renderStep: (_ctx, host) => void (host.textContent = "local") },
      ],
    });

    await tour.start();
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("global");

    await tour.next();
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("local");

    tour.destroy();
  });
});
