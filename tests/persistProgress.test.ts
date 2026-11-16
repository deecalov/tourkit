import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTour } from "../src/tour/tour";

const steps = [{ content: "one" }, { content: "two" }, { content: "three" }];
const KEY = "tour:progress";

describe("persistProgress", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  const make = () => createTour({ persistProgress: { key: KEY }, steps });

  it("stores the index on every step change", async () => {
    const tour = make();
    await tour.start();
    expect(localStorage.getItem(KEY)).toBe("0");

    await tour.next();
    expect(localStorage.getItem(KEY)).toBe("1");

    tour.destroy();
  });

  it("resumes from the stored index on the next start (new page)", async () => {
    const first = make();
    await first.start();
    await first.next();
    first.destroy(); // simulates leaving the page: no exit event, key kept

    expect(localStorage.getItem(KEY)).toBe("1");

    const second = make();
    await second.start();
    expect(second.index).toBe(1);

    second.destroy();
  });

  it("clears the key on explicit exit and on completion", async () => {
    const tour = make();
    await tour.start();
    await tour.next();
    await tour.exit();
    await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });
    expect(localStorage.getItem(KEY)).toBeNull();

    const again = make();
    await again.start();
    expect(again.index).toBe(0); // no stale resume
    await again.goTo(2);
    await again.next(); // completes
    await vi.waitFor(() => expect(again.isActive).toBe(false), { timeout: 2000 });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("ignores invalid stored values and clamps out-of-range indexes", async () => {
    localStorage.setItem(KEY, "garbage");
    const tour = make();
    await tour.start();
    expect(tour.index).toBe(0);
    tour.destroy();

    localStorage.setItem(KEY, "99");
    const clamped = make();
    await clamped.start();
    expect(clamped.index).toBe(2); // clamped to the last step
    clamped.destroy();
  });
});
