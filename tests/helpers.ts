import { afterEach, expect } from "vitest";
import { createHints, type Hints, type HintsOptions } from "../src/hints";
import { createTour, type Tour } from "../src/tour/tour";
import type { TourOptionsInput } from "../src/core/types";

/**
 * Instances created through these factories are torn down after every test.
 *
 * Removing `.tk-root` from the DOM is not enough: a live tour keeps document
 * keyboard listeners, an autoUpdater and — while a target is missing — a
 * MutationObserver with a ten second timeout. Those outlive the test file and
 * fire against a disposed jsdom (see docs/tourkit-v0.6-audit.md, D2).
 */
const tours: Tour[] = [];
const hints: Hints[] = [];

export function mountTour(options: TourOptionsInput = {}): Tour {
  const tour = createTour(options);
  tours.push(tour);
  return tour;
}

export function mountHints(options: HintsOptions = {}): Hints {
  const instance = createHints(options);
  hints.push(instance);
  return instance;
}

/** Registers an externally created instance (e.g. one built by bindTriggers). */
export function trackTour(tour: Tour): Tour {
  tours.push(tour);
  return tour;
}

export function cleanupInstances(): void {
  for (const tour of tours.splice(0)) tour.destroy();
  for (const instance of hints.splice(0)) instance.destroy();
  document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  // Body flags are reference-counted; a test that leaks one would silently
  // change what the next test observes.
  document.body.className = "";
}

afterEach(() => {
  cleanupInstances();
});

/** A `getBoundingClientRect` stub: jsdom reports zeros for every element. */
export function fakeRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Gives an element a fixed layout box so geometry code has something to read. */
export function withRect(el: Element, rect: DOMRect): Element {
  el.getBoundingClientRect = () => rect;
  return el;
}

/** The current spotlight path (`d` of the overlay), for cutout assertions. */
export function overlayPath(): string {
  const path = document.querySelector(".tk-overlay__path");
  expect(path).not.toBeNull();
  return path!.getAttribute("d")!;
}
