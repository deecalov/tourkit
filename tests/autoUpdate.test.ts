import { describe, expect, it, vi } from "vitest";
import { autoUpdate, createAutoUpdater } from "../src/geometry/autoUpdate";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

describe("createAutoUpdater", () => {
  it("attaches window listeners once and keeps them across setElements calls", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const scrollAdds = () => add.mock.calls.filter(([type]) => type === "scroll").length;

    const updater = createAutoUpdater(() => {});
    expect(scrollAdds()).toBe(1);

    // Step changes swap observed elements without re-subscribing the window.
    updater.setElements([document.body]);
    updater.setElements([document.documentElement, null]);
    expect(scrollAdds()).toBe(1);

    updater.stop();
    expect(remove.mock.calls.filter(([type]) => type === "scroll").length).toBe(1);

    add.mockRestore();
    remove.mockRestore();
  });

  it("still reacts to scroll after elements were swapped", async () => {
    const callback = vi.fn();
    const updater = createAutoUpdater(callback);
    updater.setElements([document.body]);
    updater.setElements([]);

    window.dispatchEvent(new Event("scroll"));
    await nextFrame();
    expect(callback).toHaveBeenCalledTimes(1);

    updater.stop();
  });

  it("coalesces bursts of events into one callback per frame", async () => {
    const callback = vi.fn();
    const updater = createAutoUpdater(callback);

    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    await nextFrame();

    expect(callback).toHaveBeenCalledTimes(1);
    updater.stop();
  });

  it("stop() cancels a pending frame", async () => {
    const callback = vi.fn();
    const updater = createAutoUpdater(callback);

    window.dispatchEvent(new Event("scroll"));
    updater.stop();
    await nextFrame();

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("autoUpdate (compat wrapper)", () => {
  it("returns a cleanup that detaches everything", async () => {
    const callback = vi.fn();
    const stop = autoUpdate([document.body], callback);

    window.dispatchEvent(new Event("scroll"));
    await nextFrame();
    expect(callback).toHaveBeenCalledTimes(1);

    stop();
    window.dispatchEvent(new Event("scroll"));
    await nextFrame();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
