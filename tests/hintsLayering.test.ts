import { beforeEach, describe, expect, it } from "vitest";
import { highlight } from "../src/tour/highlight";
import { fakeRect, mountHints, mountTour, withRect } from "./helpers";

/**
 * A hint popover opened while a tour (or a standalone spotlight) is on screen
 * is the topmost layer: one Esc closes it and nothing else. All layers listen
 * on `document`, so the outcome must not depend on which one registered first.
 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Real key presses are cancelable — preventDefault() is how layers hand Esc over. */
const pressEscapeOnFocus = () =>
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  );

describe("Esc with a hint popover above another layer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const target = document.createElement("button");
    target.id = "hint-target";
    withRect(target, fakeRect(40, 40, 80, 30));
    document.body.append(target);
  });

  it("closes only the popover when the hints were rendered before the tour started", async () => {
    const hints = mountHints({ hints: [{ target: "#hint-target", content: "Hi" }] }).render();
    const tour = mountTour({ steps: [{ content: "A" }, { content: "B" }] });
    await tour.start();
    hints.open(0);

    pressEscapeOnFocus();
    await sleep(250); // longer than the tour's exit fade

    expect(document.querySelector(".tk-hint-popover")).toBeNull();
    expect(tour.isActive).toBe(true);
  });

  it("closes only the popover when the tour started before the hints were rendered", async () => {
    const tour = mountTour({ steps: [{ content: "A" }, { content: "B" }] });
    await tour.start();
    const hints = mountHints({ hints: [{ target: "#hint-target", content: "Hi" }] }).render();
    hints.open(0);

    pressEscapeOnFocus();
    await sleep(250);

    expect(document.querySelector(".tk-hint-popover")).toBeNull();
    expect(tour.isActive).toBe(true);

    pressEscapeOnFocus(); // the next Esc belongs to the tour again
    await sleep(250);
    expect(tour.isActive).toBe(false);
  });

  it("keeps a standalone spotlight when Esc closes a popover above it", () => {
    const spot = highlight("#hint-target");
    const hints = mountHints({ hints: [{ target: "#hint-target", content: "Hi" }] }).render();
    hints.open(0);

    pressEscapeOnFocus();

    expect(document.querySelector(".tk-hint-popover")).toBeNull();
    expect(spot.isActive).toBe(true);
    spot.destroy();
  });
});
