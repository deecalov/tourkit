import { Emitter } from "./emitter";
import type { CompleteReason, Direction, Step, StepContext, TargetRef, TourEvents } from "./types";

export type EngineState = "idle" | "active";

/**
 * The engine drives step transitions and emits lifecycle events;
 * a delegate (the DOM renderer) performs the actual visuals.
 * The engine itself never touches the DOM apart from resolving target refs,
 * which keeps it fully unit-testable.
 */
export interface EngineDelegate {
  mount(): void | Promise<void>;
  showStep(ctx: StepContext, direction: Direction): void | Promise<void>;
  unmount(): void | Promise<void>;
}

/**
 * Resolves a step target. String selectors are queried inside `scope`, which
 * defaults to the document — pass a `ShadowRoot` to reach elements a plain
 * `document.querySelector` cannot see. Element and function refs ignore it.
 */
export function resolveTarget(ref: TargetRef | undefined, scope?: ParentNode): Element | null {
  if (!ref) return null;
  if (typeof ref === "function") return ref();
  if (typeof ref !== "string") return ref;
  const root = scope ?? (typeof document !== "undefined" ? document : null);
  return root ? root.querySelector(ref) : null;
}

/**
 * Runs a step callback without letting it break the transition: the queue is
 * driven with `void engine.next()`, so a rejected promise would surface as an
 * unhandled rejection and leave the tour with an advanced index but no
 * rendered step. `fallback` is what a failed callback is deemed to have returned.
 */
async function runStepHook<T>(name: string, hook: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await hook();
  } catch (error) {
    console.error(`[tourkit] step ${name} failed`, error);
    return fallback;
  }
}

export class TourEngine {
  readonly events = new Emitter<TourEvents>();

  private _state: EngineState = "idle";
  private _steps: Step[] = [];
  private _index: number | undefined;
  private _queue: Promise<unknown> = Promise.resolve();
  /**
   * Bumped by `forceIdle()`. A transition remembers the generation it was
   * queued in and stops at its next await once that has changed: a destroy()
   * racing a pending start() (React StrictMode, a fast route change) must not
   * mount a tour nobody owns any more, and a teardown it interrupted must not
   * reset a run started afterwards.
   */
  private _generation = 0;

  /**
   * `getScope` supplies the lookup root for string targets; it is a callback
   * because the tour facade lets `setOptions` change it mid-flight.
   */
  constructor(
    private readonly _delegate: EngineDelegate,
    private readonly _getScope: () => ParentNode | undefined = () => undefined
  ) {}

  get state(): EngineState {
    return this._state;
  }

  get index(): number | undefined {
    return this._index;
  }

  get steps(): ReadonlyArray<Step> {
    return this._steps;
  }

  get isActive(): boolean {
    return this._state === "active";
  }

  setSteps(steps: Step[]): void {
    this._steps = steps;
  }

  /**
   * Serializes all public transitions: a rapid double-click on "Next"
   * runs the second transition only after the first one fully settles.
   * A transition queued before `forceIdle()` resolves to `dropped` untouched;
   * one already running gets `live()` to check after each of its awaits.
   */
  private _enqueue<T>(dropped: T, task: (live: () => boolean) => Promise<T>): Promise<T> {
    const generation = this._generation;
    const live = () => generation === this._generation;
    const guarded = () => (live() ? task(live) : dropped);
    const run = this._queue.then(guarded, guarded);
    this._queue = run.catch(() => undefined);
    return run;
  }

  /** Starts the tour, optionally from a specific step (multi-page resume). */
  start(steps: Step[], startAt = 0): Promise<boolean> {
    return this._enqueue(false, async (live) => {
      if (this._state !== "idle" || steps.length === 0) return false;

      this._steps = steps;
      await this.events.emit("start", { steps: this._steps });
      if (!live()) return false;

      await this._delegate.mount();
      if (!live()) return false;
      this._state = "active";

      const initial = Math.min(Math.max(startAt, 0), steps.length - 1);
      const shown = await this._goTo(initial, live);
      if (!live()) return false;
      if (!shown) {
        // The very first step was cancelled by a guard: tear down quietly.
        await this._exit(true, live);
        return false;
      }
      return true;
    });
  }

  next(): Promise<void> {
    return this._enqueue(undefined, async (live) => {
      if (this._state !== "active" || this._index === undefined) return;

      if (this._index >= this._steps.length - 1) {
        await this._complete("finished", live);
        return;
      }
      await this._goTo(this._index + 1, live);
    });
  }

  back(): Promise<void> {
    return this._enqueue(undefined, async (live) => {
      if (this._state !== "active" || this._index === undefined) return;
      if (this._index <= 0) return;
      await this._goTo(this._index - 1, live);
    });
  }

  goTo(index: number): Promise<void> {
    return this._enqueue(undefined, async (live) => {
      if (this._state !== "active") return;
      if (index < 0 || index >= this._steps.length || index === this._index) return;
      await this._goTo(index, live);
    });
  }

  /** Exit initiated by the skip/close button: reports the tour as completed-by-skipping. */
  skip(): Promise<boolean> {
    return this._enqueue(false, async (live) => {
      if (this._state !== "active") return false;
      // False when a beforeExit guard blocked it.
      return this._complete("skipped", live);
    });
  }

  /**
   * Programmatic completion: reports the tour as `finished` regardless of the
   * current step (e.g. the user reached the goal outside the tour flow).
   * Guarded by `beforeExit` like every other completion path.
   */
  complete(): Promise<boolean> {
    return this._enqueue(false, async (live) => {
      if (this._state !== "active") return false;
      return this._complete("finished", live);
    });
  }

  exit(force = false): Promise<boolean> {
    return this._enqueue(false, (live) => this._exit(force, live));
  }

  /** Re-shows the current step without firing navigation guards (used by refresh). */
  reshow(): Promise<void> {
    return this._enqueue(undefined, async () => {
      if (this._state !== "active" || this._index === undefined) return;

      const index = Math.min(this._index, this._steps.length - 1);
      const step = this._steps[index];
      if (!step) return;

      this._index = index;
      const target = resolveTarget(step.target, this._getScope());
      await this._delegate.showStep({ index, step, target }, "forward");
    });
  }

  /**
   * Immediate reset used by destroy(); the delegate is torn down by the caller.
   * Transitions still queued are dropped, and the one in flight stops at its
   * next await without touching the state again.
   */
  forceIdle(): void {
    this._generation += 1;
    this._state = "idle";
    this._index = undefined;
    this._queue = Promise.resolve();
  }

  /** True when the tour actually ended (not blocked by a guard or a forceIdle). */
  private async _complete(reason: CompleteReason, live: () => boolean): Promise<boolean> {
    // Ask the beforeExit guard for permission BEFORE announcing completion:
    // a cancelled exit must not report `complete` (analytics, showOnce).
    if (!(await this._requestExit(live))) return false;
    await this.events.emit("complete", { reason });
    if (!live()) return false;
    return this._teardown(live);
  }

  private async _goTo(to: number, live: () => boolean): Promise<boolean> {
    const step = this._steps[to];
    if (!step) return false;

    const from = this._index;
    const direction: Direction = from === undefined || to >= from ? "forward" : "backward";

    let cancelled = false;
    await this.events.emit("beforeStepChange", {
      from,
      to,
      direction,
      step,
      cancel: () => {
        cancelled = true;
      },
    });
    if (cancelled || !live()) return false;

    let ctx: StepContext = {
      index: to,
      step,
      target: resolveTarget(step.target, this._getScope()),
    };

    if (step.onBeforeShow) {
      const hook = step.onBeforeShow;
      const before = ctx;
      // A throwing guard must not block the tour: show the step.
      const result = await runStepHook("onBeforeShow", () => hook(before), undefined);
      if (result === false || !live()) return false;
      // The hook typically prepares the DOM (opens a menu, switches a tab,
      // mounts a view): resolve again, or the step would neither scroll to the
      // new target nor report it to onShown / stepChange.
      ctx = { ...before, target: resolveTarget(step.target, this._getScope()) };
    }

    this._index = to;
    await this._delegate.showStep(ctx, direction);
    if (!live()) return false;
    if (step.onShown) {
      const hook = step.onShown;
      await runStepHook("onShown", () => hook(ctx), undefined);
      if (!live()) return false;
    }
    await this.events.emit("stepChange", ctx);
    return live();
  }

  private async _exit(force: boolean, live: () => boolean): Promise<boolean> {
    if (this._state === "idle") return false;
    if (!force && !(await this._requestExit(live))) return false;
    return this._teardown(live);
  }

  /** Emits the cancellable `beforeExit` guard; `false` means "stay active". */
  private async _requestExit(live: () => boolean): Promise<boolean> {
    let cancelled = false;
    await this.events.emit("beforeExit", {
      cancel: () => {
        cancelled = true;
      },
    });
    return !cancelled && live();
  }

  /** False when a forceIdle() interrupted the unmount (destroy() mid fade-out). */
  private async _teardown(live: () => boolean): Promise<boolean> {
    await this._delegate.unmount();
    // destroy() already reset everything, and a run started since then must
    // neither be reset nor hear an `exit` that is not its own.
    if (!live()) return false;
    this._index = undefined;
    this._state = "idle";
    await this.events.emit("exit", {});
    return true;
  }
}
