// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Emitter } from "../src/core/emitter";

type Events = {
  [key: string]: (payload: never) => void | Promise<void>;
  ping: (e: { value: number }) => void | Promise<void>;
};

describe("Emitter", () => {
  it("delivers payloads to subscribers", async () => {
    const emitter = new Emitter<Events>();
    const spy = vi.fn();
    emitter.on("ping", spy);

    await emitter.emit("ping", { value: 42 });

    expect(spy).toHaveBeenCalledWith({ value: 42 });
  });

  it("unsubscribes via the returned function", async () => {
    const emitter = new Emitter<Events>();
    const spy = vi.fn();
    const off = emitter.on("ping", spy);

    off();
    await emitter.emit("ping", { value: 1 });

    expect(spy).not.toHaveBeenCalled();
  });

  it("once fires a single time", async () => {
    const emitter = new Emitter<Events>();
    const spy = vi.fn();
    emitter.once("ping", spy);

    await emitter.emit("ping", { value: 1 });
    await emitter.emit("ping", { value: 2 });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("awaits async handlers sequentially", async () => {
    const emitter = new Emitter<Events>();
    const order: string[] = [];

    emitter.on("ping", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("slow");
    });
    emitter.on("ping", () => {
      order.push("fast");
    });

    await emitter.emit("ping", { value: 1 });

    expect(order).toEqual(["slow", "fast"]);
  });

  it("removeAll clears every subscription", async () => {
    const emitter = new Emitter<Events>();
    const spy = vi.fn();
    emitter.on("ping", spy);

    emitter.removeAll();
    await emitter.emit("ping", { value: 1 });

    expect(spy).not.toHaveBeenCalled();
  });
});
