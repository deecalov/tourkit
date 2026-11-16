import { beforeEach, describe, expect, it, vi } from "vitest";
import { TourEngine, type EngineDelegate } from "../src/core/engine";
import type { Step } from "../src/core/types";

const makeStep = (overrides: Partial<Step> = {}): Step => ({
  content: "content",
  placement: "bottom",
  disableInteraction: false,
  lockScroll: false,
  waitForTarget: false,
  ...overrides,
});

function makeDelegate() {
  return {
    mount: vi.fn(),
    showStep: vi.fn(),
    unmount: vi.fn(),
  } satisfies EngineDelegate;
}

describe("TourEngine", () => {
  let delegate: ReturnType<typeof makeDelegate>;
  let engine: TourEngine;

  beforeEach(() => {
    delegate = makeDelegate();
    engine = new TourEngine(delegate);
  });

  describe("start", () => {
    it("returns false with no steps", async () => {
      expect(await engine.start([])).toBe(false);
      expect(delegate.mount).not.toHaveBeenCalled();
    });

    it("mounts, shows the first step and emits events in order", async () => {
      const order: string[] = [];
      engine.events.on("start", () => {
        order.push("start");
      });
      engine.events.on("beforeStepChange", () => {
        order.push("beforeStepChange");
      });
      engine.events.on("stepChange", () => {
        order.push("stepChange");
      });
      delegate.mount.mockImplementation(() => {
        order.push("mount");
      });
      delegate.showStep.mockImplementation(() => {
        order.push("showStep");
      });

      const ok = await engine.start([makeStep()]);

      expect(ok).toBe(true);
      expect(order).toEqual(["start", "mount", "beforeStepChange", "showStep", "stepChange"]);
      expect(engine.isActive).toBe(true);
      expect(engine.index).toBe(0);
    });

    it("does not start twice", async () => {
      await engine.start([makeStep()]);
      expect(await engine.start([makeStep()])).toBe(false);
      expect(delegate.mount).toHaveBeenCalledTimes(1);
    });

    it("tears down quietly when the first step is cancelled", async () => {
      engine.events.on("beforeStepChange", (e) => e.cancel());

      const ok = await engine.start([makeStep()]);

      expect(ok).toBe(false);
      expect(engine.isActive).toBe(false);
      expect(delegate.unmount).toHaveBeenCalled();
    });
  });

  describe("navigation", () => {
    const steps = [makeStep(), makeStep(), makeStep()];

    it("next/back move between steps with correct directions", async () => {
      const directions: string[] = [];
      engine.events.on("beforeStepChange", (e) => {
        directions.push(e.direction);
      });

      await engine.start(steps);
      await engine.next();
      await engine.back();

      expect(engine.index).toBe(0);
      expect(directions).toEqual(["forward", "forward", "backward"]);
    });

    it("back on the first step is a no-op", async () => {
      await engine.start(steps);
      await engine.back();
      expect(engine.index).toBe(0);
      expect(delegate.showStep).toHaveBeenCalledTimes(1);
    });

    it("goTo jumps to an index and ignores out-of-range values", async () => {
      await engine.start(steps);

      await engine.goTo(2);
      expect(engine.index).toBe(2);

      await engine.goTo(99);
      expect(engine.index).toBe(2);

      await engine.goTo(-1);
      expect(engine.index).toBe(2);
    });

    it("beforeStepChange cancel blocks navigation in both directions", async () => {
      await engine.start(steps);
      await engine.next();

      engine.events.on("beforeStepChange", (e) => e.cancel());

      await engine.next();
      expect(engine.index).toBe(1);

      await engine.back();
      expect(engine.index).toBe(1);
    });

    it("step onBeforeShow returning false cancels the transition", async () => {
      const guarded = [makeStep(), makeStep({ onBeforeShow: () => false })];
      await engine.start(guarded);

      await engine.next();

      expect(engine.index).toBe(0);
    });

    it("onShown and target resolution feed the step context", async () => {
      const onShown = vi.fn();
      const el = document.createElement("div");
      el.id = "ctx-target";
      document.body.append(el);

      await engine.start([makeStep({ target: "#ctx-target", onShown })]);

      expect(onShown).toHaveBeenCalledWith(expect.objectContaining({ index: 0, target: el }));
      el.remove();
    });

    it("serializes concurrent transitions (double-click safety)", async () => {
      const pending: Array<() => void> = [];
      delegate.showStep.mockImplementation(
        () => new Promise<void>((resolve) => pending.push(resolve))
      );

      const started = engine.start(steps);
      await vi.waitFor(() => expect(pending).toHaveLength(1));
      pending[0]!();
      await started;

      // Two rapid next() calls: the second must wait for the first.
      const first = engine.next();
      const second = engine.next();

      await vi.waitFor(() => expect(pending).toHaveLength(2));
      expect(engine.index).toBe(1);
      // The second transition has not started while the first is in flight.
      expect(delegate.showStep).toHaveBeenCalledTimes(2);

      pending[1]!();
      await first;

      await vi.waitFor(() => expect(pending).toHaveLength(3));
      pending[2]!();
      await second;

      expect(engine.index).toBe(2);
    });
  });

  describe("completion and exit", () => {
    it("next on the last step completes with 'finished' and exits", async () => {
      const complete = vi.fn();
      const exit = vi.fn();
      engine.events.on("complete", complete);
      engine.events.on("exit", exit);

      await engine.start([makeStep()]);
      await engine.next();

      expect(complete).toHaveBeenCalledWith({ reason: "finished" });
      expect(exit).toHaveBeenCalled();
      expect(engine.isActive).toBe(false);
      expect(engine.index).toBeUndefined();
    });

    it("skip completes with 'skipped'", async () => {
      const complete = vi.fn();
      engine.events.on("complete", complete);

      await engine.start([makeStep(), makeStep()]);
      const ok = await engine.skip();

      expect(ok).toBe(true);
      expect(complete).toHaveBeenCalledWith({ reason: "skipped" });
      expect(engine.isActive).toBe(false);
    });

    it("emits beforeExit before complete (guard first)", async () => {
      const order: string[] = [];
      engine.events.on("beforeExit", () => {
        order.push("beforeExit");
      });
      engine.events.on("complete", () => {
        order.push("complete");
      });
      engine.events.on("exit", () => {
        order.push("exit");
      });

      await engine.start([makeStep()]);
      await engine.next();

      expect(order).toEqual(["beforeExit", "complete", "exit"]);
    });

    it("beforeExit cancel blocks completion: no complete, tour stays active", async () => {
      const complete = vi.fn();
      engine.events.on("complete", complete);
      engine.events.on("beforeExit", (e) => e.cancel());

      await engine.start([makeStep(), makeStep()]);
      await engine.goTo(1);
      await engine.next();

      expect(complete).not.toHaveBeenCalled();
      expect(engine.isActive).toBe(true);
      expect(engine.index).toBe(1);

      expect(await engine.skip()).toBe(false);
      expect(complete).not.toHaveBeenCalled();
      expect(engine.isActive).toBe(true);
    });

    it("plain exit does not emit complete", async () => {
      const complete = vi.fn();
      engine.events.on("complete", complete);

      await engine.start([makeStep()]);
      await engine.exit();

      expect(complete).not.toHaveBeenCalled();
      expect(engine.isActive).toBe(false);
    });

    it("beforeExit can cancel a regular exit but not a forced one", async () => {
      engine.events.on("beforeExit", (e) => e.cancel());

      await engine.start([makeStep()]);

      expect(await engine.exit()).toBe(false);
      expect(engine.isActive).toBe(true);

      expect(await engine.exit(true)).toBe(true);
      expect(engine.isActive).toBe(false);
    });

    it("exit when idle returns false", async () => {
      expect(await engine.exit()).toBe(false);
    });
  });

  describe("reshow and reset", () => {
    it("reshow re-renders the current step without guards", async () => {
      const before = vi.fn();
      await engine.start([makeStep(), makeStep()]);
      engine.events.on("beforeStepChange", before);

      await engine.reshow();

      expect(before).not.toHaveBeenCalled();
      expect(delegate.showStep).toHaveBeenCalledTimes(2);
    });

    it("reshow clamps the index after steps shrink", async () => {
      await engine.start([makeStep(), makeStep(), makeStep()]);
      await engine.goTo(2);

      engine.setSteps([makeStep()]);
      await engine.reshow();

      expect(engine.index).toBe(0);
    });

    it("forceIdle resets state immediately", async () => {
      await engine.start([makeStep()]);
      engine.forceIdle();

      expect(engine.isActive).toBe(false);
      expect(engine.index).toBeUndefined();
    });
  });
});
