import { describe, expect, it, vi } from "vitest";
import { mountTour } from "./helpers";

/**
 * destroy() is synchronous while every transition is queued and async. These
 * races are the everyday lifecycle of framework integrations: React
 * StrictMode runs effect → cleanup → effect, and a route change can destroy a
 * tour whose start() has not settled yet.
 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Longer than the renderer's 180 ms exit fade. */
const AFTER_FADE = 250;

describe("lifecycle: destroy() racing transitions", () => {
  it("start() followed by a synchronous destroy() never mounts", async () => {
    const tour = mountTour({ steps: [{ content: "A" }] });

    const started = tour.start();
    tour.destroy();

    expect(await started).toBe(false);
    await sleep(20);
    expect(document.querySelector(".tk-root")).toBeNull();
    expect(tour.isActive).toBe(false);
  });

  it("destroy() while an async start listener runs cancels the mount", async () => {
    const tour = mountTour({ steps: [{ content: "A" }] });
    tour.on("start", () => sleep(20));

    const started = tour.start();
    await sleep(5);
    tour.destroy();

    expect(await started).toBe(false);
    expect(document.querySelector(".tk-root")).toBeNull();
    expect(tour.isActive).toBe(false);
  });

  it("StrictMode-style start → destroy → start shows exactly one tour", async () => {
    const tour = mountTour({ steps: [{ content: "A" }] });

    void tour.start();
    tour.destroy();

    expect(await tour.start()).toBe(true);
    await sleep(20);
    expect(document.querySelectorAll(".tk-root")).toHaveLength(1);
    expect(tour.isActive).toBe(true);
  });

  it("destroy() during the exit fade leaves a tour started right after untouched", async () => {
    const tour = mountTour({ steps: [{ content: "A" }] });
    await tour.start();

    const exiting = tour.exit(true); // the renderer waits for the fade-out here
    await sleep(10);
    tour.destroy();
    expect(await tour.start()).toBe(true);

    await exiting;
    await sleep(AFTER_FADE);
    expect(document.querySelector(".tk-root")).not.toBeNull();
    expect(tour.isActive).toBe(true);
  });
});

describe("lifecycle: reuse after destroy()", () => {
  it("a restarted tour still marks showOnce and persists progress", async () => {
    localStorage.removeItem("lifecycle:once");
    localStorage.removeItem("lifecycle:progress");
    const tour = mountTour({
      steps: [{ content: "A" }, { content: "B" }],
      showOnce: { key: "lifecycle:once" },
      persistProgress: { key: "lifecycle:progress" },
    });
    await tour.start();
    tour.destroy();

    expect(await tour.start()).toBe(true);
    await tour.next();
    expect(localStorage.getItem("lifecycle:progress")).toBe("1");

    await tour.complete();
    expect(localStorage.getItem("lifecycle:once")).not.toBeNull();
    expect(localStorage.getItem("lifecycle:progress")).toBeNull();
    localStorage.removeItem("lifecycle:once");
  });

  it("a restarted tour leaves the active-tour registry when it exits", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = mountTour({ steps: [{ content: "A" }] });
    await first.start();
    first.destroy();
    await first.start();
    await first.exit(true);

    const second = mountTour({ steps: [{ content: "B" }] });
    await second.start();

    const stale = warn.mock.calls.filter(([message]) => String(message).includes("another tour"));
    warn.mockRestore();
    expect(stale).toEqual([]);
  });

  it("destroy() drops the application's own listeners", async () => {
    const tour = mountTour({ steps: [{ content: "A" }, { content: "B" }] });
    const onStep = vi.fn();
    tour.on("stepChange", onStep);
    await tour.start();
    tour.destroy();

    await tour.start();
    expect(onStep).toHaveBeenCalledTimes(1); // the first run only
  });
});
