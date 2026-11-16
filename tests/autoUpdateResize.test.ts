import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autoUpdate, createAutoUpdater } from "../src/geometry/autoUpdate";

/**
 * jsdom ships no ResizeObserver, so the whole "target changed size" path was
 * never executed by the suite. A recording stub covers it.
 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = 0;

  constructor(private readonly _callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.push(el);
  }

  disconnect(): void {
    this.disconnected += 1;
    this.observed.length = 0;
  }

  /** Simulates a size change of an observed element. */
  fire(): void {
    this._callback();
  }
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

describe("createAutoUpdater with ResizeObserver", () => {
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const latest = () => FakeResizeObserver.instances[FakeResizeObserver.instances.length - 1]!;

  it("observes the document element from the start", () => {
    const updater = createAutoUpdater(() => {});
    expect(latest().observed).toEqual([document.documentElement]);
    updater.stop();
  });

  it("re-observes the document element plus the given elements on setElements", () => {
    const updater = createAutoUpdater(() => {});
    const a = document.createElement("div");
    const b = document.createElement("div");

    updater.setElements([a, null, b]);

    expect(latest().disconnected).toBe(1);
    expect(latest().observed).toEqual([document.documentElement, a, b]);
    updater.stop();
  });

  it("coalesces a resize into a single callback per frame", async () => {
    const spy = vi.fn();
    const updater = createAutoUpdater(spy);

    latest().fire();
    latest().fire();
    expect(spy).not.toHaveBeenCalled();

    await frame();
    expect(spy).toHaveBeenCalledTimes(1);
    updater.stop();
  });

  it("stop() disconnects the observer", () => {
    const updater = createAutoUpdater(() => {});
    updater.stop();
    expect(latest().disconnected).toBe(1);
  });

  it("autoUpdate() observes the elements it was given", () => {
    const el = document.createElement("div");
    const cleanup = autoUpdate([el], () => {});

    expect(latest().observed).toEqual([document.documentElement, el]);
    cleanup();
    expect(latest().disconnected).toBeGreaterThan(0);
  });
});
