import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour, type Tour } from "../src/tour/tour";

describe("advanceOn", () => {
  let target: HTMLButtonElement;
  let tour: Tour | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("button");
    target.id = "adv-target";
    document.body.append(target);
  });

  afterEach(() => {
    tour?.destroy();
    tour = null;
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  it("advances to the next step when the target is clicked", async () => {
    tour = createTour({
      steps: [{ target: "#adv-target", content: "one", advanceOn: true }, { content: "two" }],
    });
    await tour.start();
    expect(tour.index).toBe(0);

    target.click();
    await vi.waitFor(() => expect(tour!.index).toBe(1));
  });

  it("is one-shot: a double event queues a single transition", async () => {
    tour = createTour({
      steps: [
        { target: "#adv-target", content: "one", advanceOn: true },
        { content: "two" },
        { content: "three" },
      ],
    });
    await tour.start();

    target.click();
    target.click(); // the listener is already gone

    await vi.waitFor(() => expect(tour!.index).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(tour.index).toBe(1);
  });

  it("supports a custom event name", async () => {
    tour = createTour({
      steps: [
        { target: "#adv-target", content: "one", advanceOn: { event: "change" } },
        { content: "two" },
      ],
    });
    await tour.start();

    target.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(tour.index).toBe(0); // click is not the configured event

    target.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(tour!.index).toBe(1));
  });

  it("removes the listener when the step changes", async () => {
    tour = createTour({
      steps: [
        { target: "#adv-target", content: "one", advanceOn: true },
        { content: "two" },
        { content: "three" },
      ],
    });
    await tour.start();
    await tour.goTo(1);

    target.click(); // stale listener must be gone
    await new Promise((r) => setTimeout(r, 50));
    expect(tour.index).toBe(1);
  });

  it("warns and stays inert when disableInteraction blocks the target", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    tour = createTour({
      steps: [
        { target: "#adv-target", content: "one", advanceOn: true, disableInteraction: true },
        { content: "two" },
      ],
    });
    await tour.start();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("advanceOn"));

    target.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(tour.index).toBe(0);
  });

  it("rebinds to a replaced target node after refresh()", async () => {
    const fakeRect = (x: number, y: number, width: number, height: number) =>
      ({
        x,
        y,
        width,
        height,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
      }) as DOMRect;
    // Visible rects: a zero-rect target would count as "still waiting".
    target.getBoundingClientRect = () => fakeRect(10, 10, 60, 24);

    tour = createTour({
      steps: [{ target: "#adv-target", content: "one", advanceOn: true }, { content: "two" }],
    });
    await tour.start();

    target.remove();
    const replacement = document.createElement("button");
    replacement.id = "adv-target";
    replacement.getBoundingClientRect = () => fakeRect(10, 10, 60, 24);
    document.body.append(replacement);
    tour.refresh(); // re-resolves the selector and moves the listener

    replacement.click();
    await vi.waitFor(() => expect(tour!.index).toBe(1));
    replacement.remove();
  });
});
