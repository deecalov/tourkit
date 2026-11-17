import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountTour } from "./helpers";

const press = (key: string) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

const title = () => document.querySelector(".tk-tooltip__title")?.textContent;

describe("keyboard navigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const start = async () => {
    const tour = mountTour({
      steps: [
        { title: "one", content: "1" },
        { title: "two", content: "2" },
        { title: "three", content: "3" },
      ],
    });
    await tour.start();
    return tour;
  };

  it("Home jumps to the first step, End to the last", async () => {
    const tour = await start();

    press("End");
    await vi.waitFor(() => expect(tour.index).toBe(2));
    expect(title()).toBe("three");

    press("Home");
    await vi.waitFor(() => expect(tour.index).toBe(0));
    expect(title()).toBe("one");
  });

  it("arrows move one step at a time and stop at the edges", async () => {
    const tour = await start();

    press("ArrowLeft"); // already first: no-op
    await Promise.resolve();
    expect(tour.index).toBe(0);

    press("ArrowRight");
    await vi.waitFor(() => expect(tour.index).toBe(1));
  });

  it("ignores navigation keys while a host input has focus", async () => {
    const input = document.createElement("input");
    document.body.append(input);

    const tour = await start();
    input.focus();

    press("End");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tour.index).toBe(0);
  });

  it("leaves arrows, Home and End to an input rendered inside the step", async () => {
    const tour = mountTour({
      steps: [
        { content: "1" },
        {
          content: "",
          renderStep: (_ctx, host) => {
            const input = document.createElement("input");
            input.id = "step-input";
            host.append(input);
          },
        },
        { content: "3" },
      ],
    });
    await tour.start();
    await tour.goTo(1); // a middle step: every key below would move away from it
    const input = document.getElementById("step-input")!;
    input.focus();

    for (const key of ["ArrowRight", "End", "ArrowLeft", "Home"]) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(tour.index, key).toBe(1);
    }
  });

  it("leaves arrows to a custom ARIA widget inside the step (role=slider)", async () => {
    const tour = mountTour({
      steps: [
        {
          content: "",
          renderStep: (_ctx, host) => {
            const slider = document.createElement("div");
            slider.id = "step-slider";
            slider.setAttribute("role", "slider");
            slider.tabIndex = 0;
            host.append(slider);
          },
        },
        { content: "2" },
      ],
    });
    await tour.start();
    const slider = document.getElementById("step-slider")!;
    slider.focus();

    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tour.index).toBe(0);

    // Back on the tour's own button the arrows navigate again.
    document.querySelector<HTMLElement>(".tk-button--primary")!.focus();
    press("ArrowRight");
    await vi.waitFor(() => expect(tour.index).toBe(1));
  });

  it("keyboard: false disables navigation but keeps Escape working", async () => {
    const tour = mountTour({
      keyboard: false,
      steps: [{ content: "1" }, { content: "2" }],
    });
    await tour.start();

    press("End");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tour.index).toBe(0);

    press("Escape");
    await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });
  });
});
