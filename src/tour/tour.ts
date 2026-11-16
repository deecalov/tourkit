import { TourEngine } from "../core/engine";
import { getDefaultOptions, mergeOptions } from "../core/options";
import { resolveStorage, type StorageKind } from "../core/storage";
import type { Step, TourEvents, TourOptionsInput } from "../core/types";
import { TourRenderer } from "../ui/renderer";
import { fromDataAttributes, normalizeSteps } from "./steps";

/** Pre-0.6 opt-out marker: a bare "1" with no timestamp. Still honoured. */
const SHOW_ONCE_LEGACY = "1";

/** Per-call overrides for `Tour.start`. */
export interface StartOptions {
  /**
   * Tear down any other running tour first (and wait for it). Without this,
   * starting a second tour leaves two overlays and two focus traps on screen
   * and only logs a warning — switching tours from a menu is the common case.
   */
  replace?: boolean;
}

export interface Tour {
  /**
   * Starts the tour. Resolves to `false` when there is nothing to show
   * (no steps, already running, opted out via `showOnce`, or no DOM).
   */
  start(options?: StartOptions): Promise<boolean>;
  /** Ends the tour; `force` bypasses the `beforeExit` guard. */
  exit(force?: boolean): Promise<boolean>;
  /**
   * Completes the tour programmatically with `reason: "finished"` (fires
   * `beforeExit` → `complete` → `exit`, marks `showOnce` as seen).
   * Resolves to `false` when inactive or cancelled by the guard.
   */
  complete(): Promise<boolean>;
  /** Instant teardown: removes DOM and all listeners, no events, no animations. */
  destroy(): void;

  next(): Promise<void>;
  back(): Promise<void>;
  /** Jumps to a step by 0-based index. */
  goTo(index: number): Promise<void>;

  /** Re-syncs geometry; with `rescanSteps` also re-reads steps and re-renders the current one. */
  refresh(rescanSteps?: boolean): void;

  readonly index: number | undefined;
  readonly steps: ReadonlyArray<Step>;
  readonly isActive: boolean;

  /** Applies an options patch; an active tour re-renders the current step live. */
  setOptions(patch: TourOptionsInput): Tour;

  on<E extends keyof TourEvents & string>(event: E, handler: TourEvents[E]): () => void;
  once<E extends keyof TourEvents & string>(event: E, handler: TourEvents[E]): () => void;
}

const hasDom = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Step index saved by `persistProgress`, or `null` when there is nothing to
 * resume. Lets a host decide whether to offer "continue where you left off"
 * *before* building the tour, without reading the storage format itself —
 * that format is an implementation detail and has changed before.
 */
export function getPersistedProgress(key: string, storage?: StorageKind): number | null {
  const raw = resolveStorage(storage).get(key);
  if (raw === null) return null;

  const index = parseInt(raw, 10);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

/**
 * Tours currently on screen. Running two at once is legitimate in rare cases
 * (a tour inside a modal that itself is toured), so this is a warning rather
 * than a guard — but it is almost always a bug: two overlays, two focus
 * traps and two Esc handlers compete for the same keyboard.
 */
const activeTours = new Set<Tour>();

/**
 * Creates a tour instance. Safe to call in SSR environments: the DOM is only
 * touched by `start()`, which no-ops (with a warning) outside the browser.
 */
export function createTour(input: TourOptionsInput = {}): Tour {
  let options = mergeOptions(getDefaultOptions(), input);
  let optedOut = false;

  const showOnceStorage = () => resolveStorage(options.showOnce?.storage);

  const markSeen = () => {
    if (!options.showOnce) return;
    // Stamped so `ttlMs` can expire the opt-out later; the value stays a
    // plain string, keeping custom StorageAdapters trivial to implement.
    showOnceStorage().set(options.showOnce.key, JSON.stringify({ v: 1, t: Date.now() }));
  };

  /** True when the tour was already completed and the mark has not expired. */
  const isSeen = (): boolean => {
    const showOnce = options.showOnce;
    if (!showOnce) return false;

    const raw = showOnceStorage().get(showOnce.key);
    if (raw === null) return false;
    if (raw === SHOW_ONCE_LEGACY || showOnce.ttlMs === undefined) return true;

    let stamped: number | undefined;
    try {
      stamped = (JSON.parse(raw) as { t?: number }).t;
    } catch {
      // A foreign or corrupted value still means "a mark is present".
      return true;
    }
    if (typeof stamped !== "number") return true;

    if (Date.now() - stamped < showOnce.ttlMs) return true;
    showOnceStorage().remove(showOnce.key);
    return false;
  };

  const renderer: TourRenderer = new TourRenderer(options, {
    getTotal: (): number => engine.steps.length,
    onNext: () => void engine.next(),
    onBack: () => void engine.back(),
    onSkip: () => void engine.skip(),
    onGoTo: (index) => void engine.goTo(index),
    onExitRequest: () => void engine.exit(false),
    isShowOnceChecked: () => optedOut,
    onShowOnceChange: (checked) => {
      optedOut = checked;
      if (!options.showOnce) return;
      if (checked) {
        markSeen();
      } else {
        showOnceStorage().remove(options.showOnce.key);
      }
    },
  });

  const engine: TourEngine = new TourEngine(renderer, () => options.root);

  // Completing the tour (Done or skip button) marks it as seen.
  engine.events.on("complete", () => markSeen());

  // Multi-page progress: remember the step on every change; a completed or
  // explicitly exited tour clears the key (navigating away keeps it, so the
  // next page resumes where the user left off).
  const progressStorage = () => resolveStorage(options.persistProgress?.storage);
  const clearProgress = () => {
    if (options.persistProgress) progressStorage().remove(options.persistProgress.key);
  };
  engine.events.on("stepChange", ({ index }) => {
    if (options.persistProgress) {
      progressStorage().set(options.persistProgress.key, String(index));
    }
  });
  engine.events.on("exit", () => {
    clearProgress();
    activeTours.delete(tour);
  });

  /** Fresh `options.steps` win; an empty list means "scan [data-tour]". */
  const resolveStepInputs = () =>
    options.steps.length > 0
      ? options.steps
      : fromDataAttributes(options.root, { attribute: options.dataAttribute });

  /**
   * Re-resolves and re-normalizes steps on an active tour (setOptions /
   * refresh(true)). The source is picked exactly like start() does — fresh
   * `options.steps` win, an empty list falls back to a DOM rescan. When
   * nothing is left to show, the tour force-exits instead of lingering as an
   * empty shell with a stale tooltip.
   */
  const reapplySteps = () => {
    const steps = normalizeSteps(resolveStepInputs(), options);
    if (steps.length === 0) {
      void engine.exit(true);
      return;
    }
    engine.setSteps(steps);
    void engine.reshow();
  };

  const tour: Tour = {
    async start(startOptions) {
      if (!hasDom()) {
        console.warn("[tourkit] start() is a no-op outside the browser.");
        return false;
      }

      if (options.showOnce) {
        optedOut = isSeen();
        if (optedOut) return false;
      }

      const others = [...activeTours].filter((other) => other !== tour);
      if (others.length > 0) {
        if (startOptions?.replace) {
          // Awaited: the previous root (and its focus trap) must be gone
          // before this one mounts, or Tab and Esc land on the wrong tour.
          await Promise.all(others.map((other) => other.exit(true)));
        } else {
          console.warn(
            "[tourkit] another tour is already running; exit it first (or use start({ replace: true })) to avoid two overlays and two focus traps."
          );
        }
      }

      let startAt = 0;
      if (options.persistProgress) {
        const { key, storage } = options.persistProgress;
        startAt = getPersistedProgress(key, storage) ?? 0;
      }

      const steps = normalizeSteps(resolveStepInputs(), options);
      const started = await engine.start(steps, startAt);
      if (started) activeTours.add(tour);
      return started;
    },

    exit(force = false) {
      return engine.exit(force);
    },

    complete() {
      return engine.complete();
    },

    destroy() {
      renderer.destroyNow();
      engine.forceIdle();
      engine.events.removeAll();
      activeTours.delete(tour);
    },

    next: () => engine.next(),
    back: () => engine.back(),
    goTo: (index) => engine.goTo(index),

    refresh(rescanSteps = false) {
      if (!engine.isActive) return;
      if (rescanSteps) {
        reapplySteps();
      } else {
        renderer.refresh();
      }
    },

    get index() {
      return engine.index;
    },
    get steps() {
      return engine.steps;
    },
    get isActive() {
      return engine.isActive;
    },

    setOptions(patch) {
      options = mergeOptions(options, patch);
      renderer.setOptions(options);
      // Re-resolve the step source (patched `options.steps` must win over a
      // previous data-attribute scan) and re-render the current step so
      // labels/buttons/overlay pick up the patch.
      if (engine.isActive) reapplySteps();
      return tour;
    },

    on: (event, handler) => engine.events.on(event, handler),
    once: (event, handler) => engine.events.once(event, handler),
  };

  return tour;
}
