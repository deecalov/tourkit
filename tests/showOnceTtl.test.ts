import { beforeEach, describe, expect, it } from "vitest";
import { mountTour } from "./helpers";

const KEY = "tour:ttl";
const DAY = 24 * 60 * 60 * 1000;

const stamp = (ageMs: number) =>
  localStorage.setItem(KEY, JSON.stringify({ v: 1, t: Date.now() - ageMs }));

describe("showOnce.ttlMs", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  const make = (ttlMs?: number) =>
    mountTour({ showOnce: { key: KEY, ttlMs }, steps: [{ content: "x" }] });

  it("blocks the tour while the mark is fresh", async () => {
    stamp(2 * DAY);
    expect(await make(30 * DAY).start()).toBe(false);
  });

  it("shows the tour again once the mark expires, clearing the key", async () => {
    stamp(31 * DAY);

    expect(await make(30 * DAY).start()).toBe(true);
    // The expired mark is dropped, not merely ignored.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("without ttlMs the mark never expires", async () => {
    stamp(365 * DAY);
    expect(await make().start()).toBe(false);
  });

  it('honours the pre-0.6 bare "1" marker', async () => {
    localStorage.setItem(KEY, "1");
    expect(await make(30 * DAY).start()).toBe(false);
  });

  it("treats an unparseable value as a mark instead of crashing", async () => {
    localStorage.setItem(KEY, "{not json");
    expect(await make(30 * DAY).start()).toBe(false);
  });

  it("re-stamps on completion so the countdown restarts", async () => {
    stamp(31 * DAY);
    const tour = make(30 * DAY);

    await tour.start();
    await tour.complete();

    const parsed = JSON.parse(localStorage.getItem(KEY)!) as { t: number };
    expect(Date.now() - parsed.t).toBeLessThan(1000);
  });
});
