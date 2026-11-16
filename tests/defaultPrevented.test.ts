import { beforeEach, describe, expect, it, vi } from "vitest";
import { highlight, type Highlight } from "../src/tour/highlight";
import { mountHints, mountTour } from "./helpers";

/** Esc that a host dialog has already consumed. */
const pressHandledEsc = () => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  event.preventDefault();
  document.dispatchEvent(event);
};

const pressEsc = () =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

/**
 * Nested Esc consumers: a host that closes its own dialog with
 * `preventDefault()` must not lose the tour, spotlight or popover underneath.
 */
describe("Esc respects event.defaultPrevented", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("tour", () => {
    it("survives an Esc the host already handled", async () => {
      const tour = mountTour({ steps: [{ content: "one" }, { content: "two" }] });
      await tour.start();

      pressHandledEsc();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(tour.isActive).toBe(true);

      // An untouched Esc still exits.
      pressEsc();
      await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });
    });

    it("still navigates on arrows the host preventDefaulted", async () => {
      // Apps block arrow scrolling routinely; treating that as "handled"
      // would silently break tour navigation.
      const tour = mountTour({ steps: [{ content: "one" }, { content: "two" }] });
      await tour.start();

      const arrow = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      });
      arrow.preventDefault();
      document.dispatchEvent(arrow);

      await vi.waitFor(() => expect(tour.index).toBe(1));
    });
  });

  describe("highlight()", () => {
    let spot: Highlight | null = null;

    beforeEach(() => {
      const target = document.createElement("div");
      target.id = "spot";
      document.body.append(target);
      spot = null;
    });

    it("survives a handled Esc and still closes on an untouched one", () => {
      spot = highlight("#spot");

      pressHandledEsc();
      expect(spot.isActive).toBe(true);

      pressEsc();
      expect(spot.isActive).toBe(false);
    });
  });

  describe("hints", () => {
    const openPopover = () => {
      const target = document.createElement("button");
      target.id = "hint-target";
      document.body.append(target);

      mountHints({ hints: [{ target: "#hint-target", content: "Explains the button" }] })
        .render()
        .open(0);

      expect(document.querySelector(".tk-hint-popover")).not.toBeNull();
    };

    it("keeps the popover open on a handled Esc", () => {
      openPopover();

      pressHandledEsc();
      expect(document.querySelector(".tk-hint-popover")).not.toBeNull();

      pressEsc();
      expect(document.querySelector(".tk-hint-popover")).toBeNull();
    });
  });
});
