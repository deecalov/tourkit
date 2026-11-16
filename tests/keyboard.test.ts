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
