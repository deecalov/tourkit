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
   */
  private _enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this._queue.then(task, task);
    this._queue = run.catch(() => undefined);
    return run;
  }

  /** Starts the tour, optionally from a specific step (multi-page resume). */
  start(steps: Step[], startAt = 0): Promise<boolean> {
    return this._enqueue(async () => {
      if (this._state !== "idle" || steps.length === 0) return false;

      this._steps = steps;
      await this.events.emit("start", { steps: this._steps });

      await this._delegate.mount();
      this._state = "active";

      const initial = Math.min(Math.max(startAt, 0), steps.length - 1);
      const shown = await this._goTo(initial);
      if (!shown) {
        // The very first step was cancelled by a guard: tear down quietly.
        await this._exit(true);
        return false;
      }
      return true;
    });
  }

  next(): Promise<void> {
    return this._enqueue(async () => {
      if (this._state !== "active" || this._index === undefined) return;

      if (this._index >= this._steps.length - 1) {
        await this._complete("finished");
        return;
      }
      await this._goTo(this._index + 1);
    });
  }

  back(): Promise<void> {
    return this._enqueue(async () => {
      if (this._state !== "active" || this._index === undefined) return;
      if (this._index <= 0) return;
      await this._goTo(this._index - 1);
    });
  }

  goTo(index: number): Promise<void> {
    return this._enqueue(async () => {
      if (this._state !== "active") return;
      if (index < 0 || index >= this._steps.length || index === this._index) return;
      await this._goTo(index);
    });
  }

  /** Exit initiated by the skip/close button: reports the tour as completed-by-skipping. */
  skip(): Promise<boolean> {
    return this._enqueue(async () => {
      if (this._state !== "active") return false;
      await this._complete("skipped");
      // _complete may have been blocked by a beforeExit guard.
      return (this._state as EngineState) === "idle";
    });
  }

  /**
   * Programmatic completion: reports the tour as `finished` regardless of the
   * current step (e.g. the user reached the goal outside the tour flow).
   * Guarded by `beforeExit` like every other completion path.
   */
  complete(): Promise<boolean> {
    return this._enqueue(async () => {
      if (this._state !== "active") return false;
      await this._complete("finished");
      return (this._state as EngineState) === "idle";
    });
  }

  exit(force = false): Promise<boolean> {
    return this._enqueue(() => this._exit(force));
  }

  /** Re-shows the current step without firing navigation guards (used by refresh). */
  reshow(): Promise<void> {
    return this._enqueue(async () => {
      if (this._state !== "active" || this._index === undefined) return;

      const index = Math.min(this._index, this._steps.length - 1);
      const step = this._steps[index];
      if (!step) return;

      this._index = index;
      const target = resolveTarget(step.target, this._getScope());
      await this._delegate.showStep({ index, step, target }, "forward");
    });
  }

  /** Immediate reset used by destroy(); the delegate is torn down by the caller. */
  forceIdle(): void {
    this._state = "idle";
    this._index = undefined;
    this._queue = Promise.resolve();
  }

  private async _complete(reason: CompleteReason): Promise<void> {
    // Ask the beforeExit guard for permission BEFORE announcing completion:
    // a cancelled exit must not report `complete` (analytics, showOnce).
    if (!(await this._requestExit())) return;
    await this.events.emit("complete", { reason });
    await this._teardown();
  }

  private async _goTo(to: number): Promise<boolean> {
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
    if (cancelled) return false;

    const ctx: StepContext = {
      index: to,
      step,
      target: resolveTarget(step.target, this._getScope()),
    };

    if (step.onBeforeShow) {
      const hook = step.onBeforeShow;
      // A throwing guard must not block the tour: show the step.
      const result = await runStepHook("onBeforeShow", () => hook(ctx), undefined);
      if (result === false) return false;
    }

    this._index = to;
    await this._delegate.showStep(ctx, direction);
    if (step.onShown) {
      const hook = step.onShown;
      await runStepHook("onShown", () => hook(ctx), undefined);
    }
    await this.events.emit("stepChange", ctx);
    return true;
  }

  private async _exit(force: boolean): Promise<boolean> {
    if (this._state === "idle") return false;
    if (!force && !(await this._requestExit())) return false;

    await this._teardown();
    return true;
  }

  /** Emits the cancellable `beforeExit` guard; `false` means "stay active". */
  private async _requestExit(): Promise<boolean> {
    let cancelled = false;
    await this.events.emit("beforeExit", {
      cancel: () => {
        cancelled = true;
      },
    });
    return !cancelled;
  }

  private async _teardown(): Promise<void> {
    await this._delegate.unmount();
    this._index = undefined;
    this._state = "idle";
    await this.events.emit("exit", {});
  }
}
