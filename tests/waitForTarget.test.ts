import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour, type Tour } from "../src/tour/tour";

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

const overlayPath = () => document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
const isCentered = () =>
  document.querySelector(".tk-tooltip")!.classList.contains("tk-tooltip--center");

describe("waitForTarget", () => {
  let tour: Tour | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    tour?.destroy();
    tour = null;
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("floats first, then anchors when the target mounts later", async () => {
    tour = createTour({
      overlay: { transitionMs: 0 },
      steps: [{ target: "#late", content: "x" }],
    });
    await tour.start();

    expect(isCentered()).toBe(true);

    const late = document.createElement("div");
    late.id = "late";
    late.getBoundingClientRect = () => fakeRect(120, 60, 40, 20);
    document.body.append(late); // MutationObserver picks this up

    // Stage = rect inflated by 8 → inner subpath starts at M(x + radius) y.
    await vi.waitFor(() => expect(overlayPath()).toContain("M120 52"), { timeout: 2000 });
    expect(isCentered()).toBe(false);
  });

  it("anchors when a present but hidden target becomes visible (attribute change)", async () => {
    const el = document.createElement("div");
    el.id = "hidden-target";
    let rect = fakeRect(0, 0, 0, 0); // display: none reports a zero rect
    el.getBoundingClientRect = () => rect;
    document.body.append(el);

    tour = createTour({
      overlay: { transitionMs: 0 },
      steps: [{ target: "#hidden-target", content: "x" }],
    });
    await tour.start();
    expect(isCentered()).toBe(true);

    rect = fakeRect(50, 50, 30, 30);
    el.setAttribute("style", "display: block"); // triggers the attribute observer

    await vi.waitFor(() => expect(overlayPath()).toContain("M50 42"), { timeout: 2000 });
  });

  it("skips to the next step on timeout with onTimeout: 'skip'", async () => {
    tour = createTour({
      steps: [
        { target: "#never", content: "one", waitForTarget: { timeoutMs: 40, onTimeout: "skip" } },
        { content: "two" },
      ],
    });
    await tour.start();
    expect(tour.index).toBe(0);

    await vi.waitFor(() => expect(tour!.index).toBe(1), { timeout: 2000 });
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("two");
  });

  it("keeps floating after the timeout with the default onTimeout: 'float'", async () => {
    tour = createTour({
      steps: [{ target: "#never", content: "one", waitForTarget: { timeoutMs: 30 } }],
    });
    await tour.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(tour.index).toBe(0);
    expect(isCentered()).toBe(true);
  });

  it("waitForTarget: false disables the DOM watch", async () => {
    tour = createTour({
      steps: [{ target: "#late-off", content: "x", waitForTarget: false }],
    });
    await tour.start();
    expect(isCentered()).toBe(true);

    const late = document.createElement("div");
    late.id = "late-off";
    late.getBoundingClientRect = () => fakeRect(200, 200, 40, 20);
    document.body.append(late);

    await new Promise((r) => setTimeout(r, 100));
    expect(isCentered()).toBe(true); // no mutation observer, still floating
  });

  it("exit() during the waiting phase tears down and stops watching", async () => {
    tour = createTour({ steps: [{ target: "#late-exit", content: "x" }] });
    await tour.start();

    await tour.exit(true);
    await vi.waitFor(() => expect(document.querySelector(".tk-root")).toBeNull());

    const late = document.createElement("div");
    late.id = "late-exit";
    document.body.append(late);
    await new Promise((r) => setTimeout(r, 60));
    expect(document.querySelector(".tk-root")).toBeNull();
  });
});
