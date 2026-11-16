import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPersistedProgress } from "../src/tour/tour";
import { memoryStorage } from "../src/core/storage";
import { mountTour } from "./helpers";

describe("start({ replace: true })", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("tears the running tour down before mounting the new one", async () => {
    const first = mountTour({ steps: [{ title: "first", content: "one" }] });
    await first.start();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const second = mountTour({ steps: [{ title: "second", content: "two" }] });
    expect(await second.start({ replace: true })).toBe(true);

    expect(first.isActive).toBe(false);
    expect(document.querySelectorAll(".tk-root")).toHaveLength(1);
    expect(document.querySelector(".tk-tooltip__title")?.textContent).toBe("second");
    // Replacing is the explicit intent, so it must not scold the caller.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still warns and stacks when replace is not asked for", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = mountTour({ steps: [{ content: "one" }] });
    await first.start();
    const second = mountTour({ steps: [{ content: "two" }] });
    await second.start();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("another tour is already running"));
    expect(first.isActive).toBe(true);
    warn.mockRestore();
  });

  it("is a plain start when nothing else is running", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tour = mountTour({ steps: [{ content: "one" }] });

    expect(await tour.start({ replace: true })).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not exit itself when restarted with replace", async () => {
    const tour = mountTour({ steps: [{ content: "one" }] });
    await tour.start();

    // The engine refuses a second start; the tour must survive it intact.
    expect(await tour.start({ replace: true })).toBe(false);
    expect(tour.isActive).toBe(true);
  });
});

describe("getPersistedProgress", () => {
  const KEY = "tour:progress-probe";

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("reports null when there is nothing saved", () => {
    expect(getPersistedProgress(KEY)).toBeNull();
  });

  it("reports the index a running tour saved", async () => {
    const tour = mountTour({
      persistProgress: { key: KEY },
      steps: [{ content: "one" }, { content: "two" }],
    });
    await tour.start();
    await tour.next();

    expect(getPersistedProgress(KEY)).toBe(1);
  });

  it("clears back to null once the tour exits", async () => {
    const tour = mountTour({ persistProgress: { key: KEY }, steps: [{ content: "one" }] });
    await tour.start();
    await tour.exit(true);

    expect(getPersistedProgress(KEY)).toBeNull();
  });

  it("reads the storage the tour was configured with", async () => {
    const tour = mountTour({
      persistProgress: { key: KEY, storage: memoryStorage },
      steps: [{ content: "one" }, { content: "two" }],
    });
    await tour.start();
    await tour.next();

    expect(getPersistedProgress(KEY)).toBeNull(); // not in localStorage
    expect(getPersistedProgress(KEY, memoryStorage)).toBe(1);
    memoryStorage.remove(KEY);
  });

  it("treats a corrupted value as no progress", () => {
    localStorage.setItem(KEY, "not-a-number");
    expect(getPersistedProgress(KEY)).toBeNull();

    localStorage.setItem(KEY, "-3");
    expect(getPersistedProgress(KEY)).toBeNull();
  });
});
