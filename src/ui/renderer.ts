import { resolveTarget, type EngineDelegate } from "../core/engine";
import { formatLabel } from "../core/options";
import type { Direction, StepContext, TourOptions, WaitForTargetOptions } from "../core/types";
import { createAutoUpdater, type AutoUpdater } from "../geometry/autoUpdate";
import { inflate, rectsEqual, targetRect, viewportRect, type Rect } from "../geometry/rect";
import { scrollTargetIntoView } from "../geometry/scrollIntoView";
import { caf, h, inHintPopover, prefersReducedMotion, raf } from "./dom";
import { activeElement, rememberFocus } from "./focus";
import { acquireHostClass, TOUR_ACTIVE_CLASS } from "./hostFlags";
import { SpotlightOverlay } from "./overlay";
import { lockDocumentScroll } from "./scrollLock";
import { TooltipView } from "./tooltip";

export interface RendererHooks {
  getTotal: () => number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onGoTo: (index: number) => void;
  /** Exit requested via Esc or a click on the dimmed backdrop. */
  onExitRequest: () => void;
  isShowOnceChecked: () => boolean;
  onShowOnceChange: (checked: boolean) => void;
}

/** Must match the `--tk-transition` duration in styles.css. */
const EXIT_FADE_MS = 180;

/** A connected but not rendered target (display: none) collapses to this. */
const isZeroRect = (rect: Rect): boolean => rect.width === 0 && rect.height === 0;

/** Editable host controls where Esc carries its own meaning. */
function isEditableControl(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  );
}

/** ARIA composite widgets that move their own selection with arrows / Home / End. */
const ARROW_WIDGETS = "slider spinbutton listbox radiogroup tablist menu menubar grid tree"
  .split(" ")
  .map((role) => `[role=${role}]`)
  .join();

/** Focus sits in a control that uses the navigation keys itself. */
function ownsNavigationKeys(el: Element | null): boolean {
  return isEditableControl(el) || el?.closest(ARROW_WIDGETS) != null;
}

/**
 * DOM side of the tour: mounts a single fixed, pointer-transparent root
 * with the spotlight overlay, the tooltip, an optional interaction guard
 * and a live region. Implements the engine's delegate contract.
 */
export class TourRenderer implements EngineDelegate {
  private _root: HTMLDivElement | null = null;
  private _overlay: SpotlightOverlay | null = null;
  private _tooltip: TooltipView | null = null;
  /** One guard per cutout (main stage + step.highlight extras), lazily pooled. */
  private _guards: HTMLDivElement[] = [];
  private _live: HTMLDivElement | null = null;

  private _ctx: StepContext | null = null;
  /** One set of scroll/resize listeners for the whole tour (created on mount);
   *  only the observed element list changes between steps. */
  private _autoUpdater: AutoUpdater | null = null;
  private _stopKeyboard: (() => void) | null = null;
  private _restoreFocus: (() => void) | null = null;
  /** Last applied guard geometries (empty = hidden) — skips no-op style writes. */
  private _guardStages: Rect[] = [];
  /** Active waitForTarget watcher (MutationObserver + timeout); null when idle. */
  private _targetWatch: { stop: () => void } | null = null;
  /** advanceOn listener bound to the current step's resolved target. */
  private _advance: { el: Element; event: string; handler: EventListener } | null = null;
  /** Host elements made inert by modal mode, with their previous state. */
  private _inerted: Array<{ el: Element; hadInert: boolean }> = [];
  private _modalApplied = false;
  /** Restores the host scrolling frozen by `lockScroll`; null when unlocked. */
  private _releaseScrollLock: (() => void) | null = null;
  /** Removes the `tk-tour-active` body flag; null when the flag is not held. */
  private _releaseHostClass: (() => void) | null = null;
  /**
   * Bumped by destroyNow(). An unmount() still waiting for its fade-out when
   * the tour is destroyed (and possibly started again) must not remove the
   * DOM of the newer run when the timer finally fires.
   */
  private _generation = 0;

  constructor(
    private _options: TourOptions,
    private readonly _hooks: RendererHooks
  ) {}

  /**
   * Live options update. Safe both before `start()` and mid-tour: mounted
   * components re-apply everything they configured at mount time (theme,
   * z-index, overlay styling, keyboard listeners). Step content itself is
   * re-rendered by the caller via `engine.reshow()`.
   */
  setOptions(options: TourOptions): void {
    this._options = options;
    this._tooltip?.setOptions(options);
    this._overlay?.setOptions(options.overlay);

    if (!this._root) return;

    if (options.theme) {
      this._root.dataset["tkTheme"] = options.theme;
    } else {
      delete this._root.dataset["tkTheme"];
    }
    if (options.zIndex !== undefined) {
      this._root.style.setProperty("--tk-z", String(options.zIndex));
    } else {
      this._root.style.removeProperty("--tk-z");
    }
    if (this._overlay) {
      this._overlay.el.setAttribute(
        "class",
        `tk-overlay${options.classes?.overlay ? ` ${options.classes.overlay}` : ""}`
      );
    }

    // Live modal toggle: (un)mark the dialog and (un)inert the host page.
    if (options.modal) {
      this._tooltip?.el.setAttribute("aria-modal", "true");
      this._applyInert();
    } else {
      this._tooltip?.el.removeAttribute("aria-modal");
      this._releaseInert();
    }

    this._syncScrollLock();
    this._syncHostClass();

    // Covers keyboard/exitOnEsc toggles even when no listener was bound at mount.
    this._stopKeyboard?.();
    this._stopKeyboard = null;
    this._bindKeyboard();
  }

  mount(): void {
    if (this._root) return;

    this._restoreFocus = rememberFocus();

    const o = this._options;
    this._root = h("div", { className: "tk-root" });
    if (o.theme) this._root.dataset["tkTheme"] = o.theme;
    if (o.zIndex !== undefined) this._root.style.setProperty("--tk-z", String(o.zIndex));

    this._overlay = new SpotlightOverlay(
      o.overlay,
      { onBackdropClick: () => this._hooks.onExitRequest() },
      o.classes?.overlay
    );

    this._tooltip = new TooltipView(o, {
      onNext: () => this._hooks.onNext(),
      onBack: () => this._hooks.onBack(),
      onSkip: () => this._hooks.onSkip(),
      onBullet: (i) => this._hooks.onGoTo(i),
      isShowOnceChecked: () => this._hooks.isShowOnceChecked(),
      onShowOnceChange: (checked) => this._hooks.onShowOnceChange(checked),
    });

    this._live = h("div", {
      className: "tk-live",
      attrs: { "aria-live": "polite", role: "status" },
    });

    this._root.append(this._overlay.el, this._tooltip.el, this._live);
    (o.container ?? document.body).append(this._root);

    if (o.modal) {
      this._tooltip.el.setAttribute("aria-modal", "true");
      this._applyInert();
    }

    this._bindKeyboard();
    this._syncHostClass();
    this._autoUpdater = createAutoUpdater(() => this._sync());

    // Fade the root in on the next frame so the CSS transition kicks in.
    raf(() => this._root?.classList.add("tk-root--visible"));
  }

  showStep(ctx: StepContext, _direction: Direction): void {
    if (!this._root || !this._overlay || !this._tooltip) return;

    this._stopTargetWatch();
    this._ctx = ctx;

    // Before any measurement: (un)locking removes or restores the scrollbar,
    // which changes the layout viewport the spotlight is drawn in.
    this._syncScrollLock();

    if (ctx.target) {
      scrollTargetIntoView(ctx.target, { ...this._options.scroll, ...ctx.step.scroll });
    }

    const stage = this._stageRect();
    const extras = this._extraStages();
    this._overlay.setStage(stage, true, extras);

    this._tooltip.render(ctx, this._hooks.getTotal());
    // The tooltip is anchored to the spotlight cutout (stage), not to the raw
    // element rect: the cutout is `overlay.padding` wider, and the arrow must
    // point at the visible white frame instead of piercing into it.
    this._tooltip.position(stage);
    this._updateGuards(stage, extras);
    this._announce(ctx);
    this._tooltip.focus();

    this._autoUpdater?.setElements([ctx.target, ...this._extraTargets(), this._tooltip.el]);
    this._bindAdvance();

    // The step wants a target but none is usable yet (not mounted or still
    // hidden): float for now and watch the DOM for its appearance.
    if (stage === null && ctx.step.target !== undefined && ctx.step.waitForTarget !== false) {
      this._startTargetWatch(ctx.step.waitForTarget);
    }
  }

  /** Re-syncs geometry with the current DOM state (scroll, resize, mutations). */
  refresh(): void {
    this._sync();
  }

  async unmount(): Promise<void> {
    const root = this._root;
    if (!root) return;
    const generation = this._generation;

    this._teardownListeners();

    root.classList.remove("tk-root--visible");
    if (!prefersReducedMotion()) {
      await new Promise<void>((resolve) => setTimeout(resolve, EXIT_FADE_MS));
    }

    // destroyNow() ran during the fade: it already removed this root and
    // restored focus, and whatever is mounted now belongs to a newer run.
    if (generation !== this._generation) return;
    this._removeDom();
    this._restoreFocus?.();
    this._restoreFocus = null;
  }

  /** Synchronous teardown without animations (destroy()). */
  destroyNow(): void {
    this._generation += 1;
    this._teardownListeners();
    this._removeDom();
    this._restoreFocus?.();
    this._restoreFocus = null;
  }

  private _teardownListeners(): void {
    this._stopTargetWatch();
    this._unbindAdvance();
    this._releaseInert();
    this._releaseScroll();
    this._autoUpdater?.stop();
    this._autoUpdater = null;
    this._stopKeyboard?.();
    this._stopKeyboard = null;
  }

  /**
   * Modal mode: every sibling of the tour root becomes `inert` while the
   * tour runs. This is the one deliberate host-DOM mutation besides the
   * temporary scroll-margin — opt-in, remembered and fully restored.
   */
  private _applyInert(): void {
    if (this._modalApplied || !this._root) return;
    this._modalApplied = true;

    const parent = this._root.parentElement;
    if (!parent) return;
    this._inerted = [];
    for (const el of Array.from(parent.children)) {
      if (el === this._root) continue;
      this._inerted.push({ el, hadInert: el.hasAttribute("inert") });
      el.setAttribute("inert", "");
    }
  }

  private _releaseInert(): void {
    if (!this._modalApplied) return;
    this._modalApplied = false;
    for (const { el, hadInert } of this._inerted) {
      if (!hadInert) el.removeAttribute("inert");
    }
    this._inerted = [];
  }

  /** Applies the current step's `lockScroll` state (tour default or override). */
  private _syncScrollLock(): void {
    const wanted = this._ctx?.step.lockScroll ?? this._options.lockScroll;
    if (wanted === (this._releaseScrollLock !== null)) return;

    if (wanted) {
      this._releaseScrollLock = lockDocumentScroll();
    } else {
      this._releaseScrollLock?.();
      this._releaseScrollLock = null;
    }
  }

  private _releaseScroll(): void {
    this._releaseScrollLock?.();
    this._releaseScrollLock = null;
  }

  /** The body flag lives exactly as long as the mounted root (and `hostClasses`). */
  private _syncHostClass(): void {
    const wanted = this._root !== null && this._options.hostClasses;
    if (wanted === (this._releaseHostClass !== null)) return;

    if (wanted) {
      this._releaseHostClass = acquireHostClass(TOUR_ACTIVE_CLASS);
    } else {
      this._releaseHostClass?.();
      this._releaseHostClass = null;
    }
  }

  private _removeDom(): void {
    this._overlay?.destroy();
    this._tooltip?.destroy();
    this._root?.remove();
    this._root = null;
    this._syncHostClass();
    this._overlay = null;
    this._tooltip = null;
    this._guards = [];
    this._guardStages = [];
    this._live = null;
    this._ctx = null;
  }

  /**
   * Current step target, re-resolved when the original element left the DOM
   * (frameworks and widgets replace nodes wholesale). Selector and function
   * refs resolve again; a direct Element ref cannot be recovered.
   */
  private _liveTarget(): Element | null {
    if (!this._ctx) return null;

    const current = this._ctx.target;
    if (current && current.isConnected) return current;

    const next = resolveTarget(this._ctx.step.target, this._options.root);
    const resolved = next && next.isConnected ? next : null;
    if (resolved !== current) {
      this._ctx = { ...this._ctx, target: resolved };
      // The tooltip keeps its own context for the focus trap and placement —
      // it must follow the re-resolved target, not the disconnected node.
      this._tooltip?.syncContext(this._ctx);
      this._autoUpdater?.setElements([
        resolved,
        ...this._extraTargets(),
        ...(this._tooltip ? [this._tooltip.el] : []),
      ]);
      // A replaced node keeps its advanceOn behavior; the awaited-appearance
      // path binds through _presentAwaitedTarget instead.
      if (resolved && !this._targetWatch) this._bindAdvance();
    }
    return resolved;
  }

  private _targetRect(): Rect | null {
    const target = this._liveTarget();
    if (!target) return null;
    const rect = targetRect(target);
    // A connected but hidden target (display: none after start — tabs,
    // accordions) reports a zero rect at the origin. Treat it as missing so
    // the step floats instead of spotlighting the top-left corner.
    return isZeroRect(rect) ? null : rect;
  }

  private _stageRect(): Rect | null {
    const rect = this._targetRect();
    return rect ? inflate(rect, this._options.overlay.padding) : null;
  }

  /** Resolved extra highlight elements of the current step (step.highlight). */
  private _extraTargets(): Element[] {
    return (this._ctx?.step.highlight ?? [])
      .map((ref) => resolveTarget(ref, this._options.root))
      .filter((el): el is Element => el !== null && el.isConnected);
  }

  private _extraStages(): Rect[] {
    return this._extraTargets()
      .map((el) => targetRect(el))
      .filter((rect) => !isZeroRect(rect))
      .map((rect) => inflate(rect, this._options.overlay.padding));
  }

  private _sync(): void {
    if (!this._ctx || !this._overlay || !this._tooltip) return;

    // Read phase first, then writes: interleaving getBoundingClientRect /
    // offsetWidth with style writes would force a reflow per layer on every
    // scroll frame (layout thrashing).
    const stage = this._stageRect();
    const extras = this._extraStages();

    // An awaited target just became usable (mounted or un-hidden): present
    // it like a step transition — scroll to it and flow the spotlight from
    // the center — instead of the instant repaint below.
    if (this._targetWatch && stage) {
      this._stopTargetWatch();
      this._presentAwaitedTarget();
      return;
    }

    const size = this._tooltip.measure();
    const viewport = viewportRect();

    this._overlay.refresh(stage, extras);
    this._tooltip.position(stage, { size, viewport });
    this._updateGuards(stage, extras);
  }

  /** Anchors the current floating step to a target that appeared late. */
  private _presentAwaitedTarget(): void {
    const ctx = this._ctx;
    if (!ctx || !this._overlay || !this._tooltip) return;

    if (ctx.target) {
      scrollTargetIntoView(ctx.target, { ...this._options.scroll, ...ctx.step.scroll });
    }

    const stage = this._stageRect();
    const extras = this._extraStages();
    this._overlay.setStage(stage, true, extras);
    this._tooltip.position(stage);
    this._updateGuards(stage, extras);
    this._bindAdvance();
    // The step visually changed (floating dialog → spotlight on an element);
    // screen reader users get nothing from the repaint, so repeat the
    // announcement — the live region must be emptied first, otherwise an
    // unchanged text node produces no utterance.
    this._announce(ctx, true);
  }

  /**
   * Watches the DOM while the current step's target is missing: childList
   * mutations catch late mounts, attribute changes catch un-hiding
   * (`display`/`hidden`/class toggles). Mutation bursts are coalesced to one
   * `_sync()` per frame. Scoped to the waiting phase — disconnected as soon
   * as the target is presented, the step changes or the timeout fires.
   */
  private _startTargetWatch(policy: WaitForTargetOptions): void {
    this._stopTargetWatch();
    if (typeof MutationObserver === "undefined") return;

    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = raf(() => {
        frame = 0;
        this._sync();
      });
    });
    const observeOptions: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    };
    observer.observe(document.body, observeOptions);
    // `subtree` on document.body stops at the shadow boundary, so a scoped
    // ShadowRoot (or detached subtree) must be observed directly as well.
    const scope = this._options.root;
    if (scope && scope !== document && !document.body.contains(scope)) {
      observer.observe(scope, observeOptions);
    }

    const timer = window.setTimeout(() => {
      const skip = policy.onTimeout === "skip";
      this._stopTargetWatch();
      if (skip) this._hooks.onNext();
    }, policy.timeoutMs);

    this._targetWatch = {
      stop: () => {
        observer.disconnect();
        if (frame) caf(frame);
        window.clearTimeout(timer);
      },
    };
  }

  private _stopTargetWatch(): void {
    this._targetWatch?.stop();
    this._targetWatch = null;
  }

  /**
   * (Re)binds the `advanceOn` listener to the current resolved target.
   * Idempotent: always unbinds the previous listener first, so it is safe to
   * call on every step render, target re-resolve and awaited appearance.
   */
  private _bindAdvance(): void {
    this._unbindAdvance();
    const ctx = this._ctx;
    if (!ctx?.step.advanceOn || !ctx.target) return;

    const blocked =
      this._options.modal || (ctx.step.disableInteraction ?? this._options.disableInteraction);
    if (blocked) {
      console.warn(
        "[tourkit] advanceOn needs an interactive target; disableInteraction/modal blocks the event."
      );
      return;
    }

    const advance = ctx.step.advanceOn;
    const event = advance === true ? "click" : (advance.event ?? "click");
    const handler = () => {
      // One shot: drop the listener before navigating so a double event
      // cannot queue two transitions.
      this._unbindAdvance();
      this._hooks.onNext();
    };
    // Capture phase: fires even when the app's own handlers on descendants
    // stop propagation.
    ctx.target.addEventListener(event, handler, { capture: true });
    this._advance = { el: ctx.target, event, handler };
  }

  private _unbindAdvance(): void {
    if (!this._advance) return;
    this._advance.el.removeEventListener(this._advance.event, this._advance.handler, {
      capture: true,
    });
    this._advance = null;
  }

  /** One guard per cutout: the main stage and every `step.highlight` extra. */
  private _updateGuards(stage: Rect | null, extras: Rect[]): void {
    if (!this._root || !this._tooltip) return;

    // A step may have highlight-only cutouts without a main target — those
    // still need covering, so `stage === null` must not disable the guards.
    const active = this._ctx?.step.disableInteraction ?? this._options.disableInteraction;
    const next: Rect[] = active ? [...(stage ? [stage] : []), ...extras] : [];

    // Same geometry (or still hidden) — every write below would be a no-op.
    if (
      this._guardStages.length === next.length &&
      this._guardStages.every((rect, i) => rectsEqual(rect, next[i] ?? null))
    ) {
      return;
    }
    this._guardStages = next;

    while (this._guards.length < next.length) {
      const guard = h("div", {
        className: "tk-interaction-guard",
        attrs: { "aria-hidden": "true" },
      });
      // Guards sit below the tooltip in the stacking order.
      this._tooltip.el.before(guard);
      this._guards.push(guard);
    }
    while (this._guards.length > next.length) {
      this._guards.pop()!.remove();
    }

    next.forEach((rect, i) => {
      const guard = this._guards[i]!;
      guard.style.left = `${rect.x}px`;
      guard.style.top = `${rect.y}px`;
      guard.style.width = `${rect.width}px`;
      guard.style.height = `${rect.height}px`;
    });
  }

  private _announce(ctx: StepContext, repeat = false): void {
    const live = this._live;
    if (!live) return;

    const total = this._hooks.getTotal();
    const prefix = formatLabel(this._options.labels.stepAnnouncement, ctx.index + 1, total);
    const title = ctx.step.title ? `: ${ctx.step.title}` : "";
    const text = `${prefix}${title}`;

    if (repeat && live.textContent === text) {
      live.textContent = "";
      raf(() => {
        if (this._live === live) live.textContent = text;
      });
      return;
    }
    live.textContent = text;
  }

  private _bindKeyboard(): void {
    if (!this._options.keyboard && !this._options.exitOnEsc) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const focusTarget = activeElement();
      const inTour = this._root?.contains(focusTarget) ?? false;

      if (e.key === "Escape") {
        // The host already acted on this Esc (closed its own dialog opened on
        // top of a step): ending the tour too is a second, unasked-for
        // reaction to one keystroke. Navigation keys are deliberately exempt —
        // apps commonly preventDefault arrows to stop the page scrolling.
        if (e.defaultPrevented) return;
        if (!this._options.exitOnEsc) return;
        // Esc inside a host input has its own meaning (dismiss autocomplete,
        // clear the field) — closing the tour on top of that is hostile.
        // Inside the tour UI Esc keeps the dialog semantics and exits.
        if (!inTour && isEditableControl(focusTarget)) return;
        // A hint popover opened above the step owns this Esc.
        if (inHintPopover(focusTarget)) return;
        e.preventDefault();
        this._hooks.onExitRequest();
        return;
      }

      if (!this._options.keyboard) return;

      // Navigation keys only when focus is inside the tour UI or on the page
      // body — never hijack typing in the host application's inputs.
      const onBody = focusTarget === document.body || focusTarget === null;
      if (!inTour && !onBody) return;
      // Interactive step content (renderStep forms, sliders, selects) keeps
      // its caret and selection keys; the tour's own buttons still navigate.
      if (ownsNavigationKeys(focusTarget)) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          this._hooks.onNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          this._hooks.onBack();
          break;
        case "Home":
          e.preventDefault();
          this._hooks.onGoTo(0);
          break;
        case "End":
          e.preventDefault();
          this._hooks.onGoTo(this._hooks.getTotal() - 1);
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    this._stopKeyboard = () => document.removeEventListener("keydown", onKeyDown);
  }
}
