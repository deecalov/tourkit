import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTour } from "../src/tour/tour";

/** The stored marker is `{"v":1,"t":<epoch ms>}` — a stamp enables `ttlMs`. */
const storedStamp = (key: string): number => {
  const raw = localStorage.getItem(key);
  expect(raw).not.toBeNull();
  return (JSON.parse(raw!) as { v: number; t: number }).t;
};

describe("showOnce", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("marks the tour as seen on completion and blocks the next start", async () => {
    const key = "tour:test";
    const make = () => createTour({ showOnce: { key }, steps: [{ content: "only" }] });

    const first = make();
    expect(await first.start()).toBe(true);
    await first.next(); // completes the single-step tour

    await vi.waitFor(() => expect(first.isActive).toBe(false), { timeout: 2000 });
    expect(storedStamp(key)).toBeLessThanOrEqual(Date.now());

    const second = make();
    expect(await second.start()).toBe(false);
  });

  it("does not mark the tour on a plain exit (Esc-like)", async () => {
    const key = "tour:test2";
    const tour = createTour({ showOnce: { key }, steps: [{ content: "one" }] });

    await tour.start();
    await tour.exit();

    expect(localStorage.getItem(key)).toBeNull();
    tour.destroy();
  });

  it("does not mark the tour when beforeExit cancels a skip", async () => {
    const key = "tour:test-guard";
    const guard = vi.fn((e: { cancel(): void }) => e.cancel());
    const tour = createTour({
      showOnce: { key },
      steps: [{ content: "one" }, { content: "two" }],
    });
    tour.on("beforeExit", guard);

    await tour.start();
    const skipButton = document.querySelector<HTMLButtonElement>(".tk-tooltip__close")!;
    skipButton.click();
    await vi.waitFor(() => expect(guard).toHaveBeenCalled());

    expect(localStorage.getItem(key)).toBeNull();
    expect(tour.isActive).toBe(true);

    tour.destroy();
  });

  it("renders the opt-out checkbox and persists its state immediately", async () => {
    const key = "tour:test3";
    const tour = createTour({
      showOnce: { key, checkbox: true },
      steps: [{ content: "one" }, { content: "two" }],
    });
    await tour.start();

    const box = document.querySelector<HTMLInputElement>(".tk-tooltip__once-box")!;
    expect(box).not.toBeNull();

    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(storedStamp(key)).toBeLessThanOrEqual(Date.now());

    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(localStorage.getItem(key)).toBeNull();

    tour.destroy();
  });

  it("uses a custom storage adapter when provided", async () => {
    const store = new Map<string, string>();
    const adapter = {
      get: (k: string) => store.get(k) ?? null,
      set: (k: string, v: string) => void store.set(k, v),
      remove: (k: string) => void store.delete(k),
    };

    store.set("seen", "1");
    const tour = createTour({
      showOnce: { key: "seen", storage: adapter },
      steps: [{ content: "x" }],
    });

    expect(await tour.start()).toBe(false);
  });
});
