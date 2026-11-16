/** Sides the tooltip can be placed on, relative to the target. */
export type Side = "top" | "bottom" | "left" | "right";

/** Cross-axis alignment of the tooltip along the chosen side. */
export type Align = "start" | "center" | "end";

/**
 * Placement of the tooltip: a side with optional alignment,
 * or "center" for a floating step without a target.
 */
export type Placement = Side | `${Side}-${Align}` | "center";

import type { StorageKind } from "./storage";

export interface Labels {
  next: string;
  back: string;
  done: string;
  skip: string;
  /** Template for "3 of 7"; `{step}` and `{total}` are substituted. */
  stepOf: string;
  /** aria-label announcing the step, e.g. for the live region. */
  stepAnnouncement: string;
  /** Label of the `showOnce` checkbox. */
  dontShowAgain: string;
  /**
   * Dismiss button of a hint popover (`sitetourkit/hints`). Optional so existing
   * custom label sets keep type-checking; the bundled locales all provide it.
   */
  hintDismiss?: string;
}

export interface ShowOnceOptions {
  /** Persistence key, e.g. "tour:onboarding". */
  key: string;
  /** Where to persist: localStorage (default), sessionStorage or a custom adapter. */
  storage?: StorageKind;
  /** Render a "don't show this again" checkbox in the tooltip. */
  checkbox?: boolean;
  /**
   * Show the tour again after this many milliseconds ("remind me in 30 days").
   * Omitted means the opt-out never expires.
   */
  ttlMs?: number;
}

export interface ScrollOptions {
  /** Vertical positioning of the target after scrolling. "off" disables scrolling. */
  block: "center" | "nearest" | "off";
  behavior: "smooth" | "auto";
  /** Extra distance in px kept between the target and the viewport edge. */
  padding: number;
}

export interface OverlayOptions {
  opacity: number;
  color: string;
  /** Gap in px between the target and the spotlight cutout edge. */
  padding: number;
  /** Corner radius of the cutout in px. */
  radius: number;
  clickToExit: boolean;
  /** Duration of the cutout "flow" animation between steps, in ms. */
  transitionMs: number;
}

export interface ButtonsOptions {
  next: boolean;
  back: boolean;
  skip: boolean;
  /** Turn the Next button into Done on the last step (otherwise Next is disabled). */
  doneOnLast: boolean;
  /** Hide the Back button on the first step instead of rendering it disabled. */
  hideBackOnFirst: boolean;
  /**
   * Hide the Next button on the last step instead of rendering it disabled.
   * Only applies when `doneOnLast` is off (otherwise Done is shown).
   */
  hideNextOnLast: boolean;
}

/**
 * Waiting for an asynchronously mounted target (SPA views, lazy widgets).
 * While the target is missing the step floats in the center; the DOM is
 * watched and the spotlight flows to the target as soon as it appears.
 */
export interface WaitForTargetOptions {
  /** How long to keep watching for the target, in ms. */
  timeoutMs: number;
  /** After the timeout: keep the floating step or skip to the next one. */
  onTimeout: "float" | "skip";
}

/**
 * Auto-advance when the user interacts with the highlighted target
 * ("click here to continue"). `true` means `{ event: "click" }`.
 * Requires interaction with the target (`disableInteraction: false`).
 */
export type AdvanceOn = true | { event?: string };

/** Resolvable reference to a step's target element. */
export type TargetRef = string | Element | (() => Element | null);

export interface StepContext {
  index: number;
  step: Step;
  target: Element | null;
}

/**
 * Custom renderer for step content. Receives the content host element;
 * may return a cleanup function invoked when the step changes or the tour ends.
 */
export type RenderStep = (ctx: StepContext, host: HTMLElement) => void | (() => void);

export interface StepInput {
  /** Highlight target. Omit for a centered, floating step. */
  target?: TargetRef;
  /** Additional elements to spotlight together with `target` (extra cutouts). */
  highlight?: TargetRef[];
  title?: string;
  content: string;
  placement?: Placement;
  disableInteraction?: boolean;
  scroll?: Partial<ScrollOptions>;
  classes?: { tooltip?: string };
  /** Overrides `TourOptions.renderStep` for this step. */
  renderStep?: RenderStep;
  /** Overrides `TourOptions.waitForTarget` for this step; `false` disables. */
  waitForTarget?: Partial<WaitForTargetOptions> | false;
  /** Overrides `TourOptions.lockScroll` for this step. */
  lockScroll?: boolean;
  /** Advance to the next step when the target receives this event. */
  advanceOn?: AdvanceOn;
  /** Return `false` to cancel showing this step (navigation is aborted). */
  onBeforeShow?: (ctx: StepContext) => void | boolean | Promise<void | boolean>;
  onShown?: (ctx: StepContext) => void;
}

/** Normalized step used internally and exposed via `tour.steps`. */
export interface Step extends StepInput {
  placement: Placement;
  disableInteraction: boolean;
  lockScroll: boolean;
  /** Resolved waiting policy (tour default merged with the step override). */
  waitForTarget: WaitForTargetOptions | false;
}

export interface TourOptions {
  steps: StepInput[];
  /** Where the tour root is mounted. Defaults to `document.body`. */
  container?: Element;
  /**
   * Scope for resolving string selectors and for scanning `[data-tour]`
   * elements. Pass a `ShadowRoot` (or a subtree element) to tour content
   * inside a web component: `document.querySelector` cannot reach into a
   * shadow tree. Function targets work regardless of this option.
   */
  root?: Document | ShadowRoot | Element;

  /**
   * Base name of the declarative attributes, `data-tour` by default. Set it
   * when the page already uses `data-tour` for its own purposes — otherwise
   * a `createTour()` without `steps` would build a tour out of that markup.
   * Modifiers follow the base name: `data-tk-step-title`, `-placement`, ...
   */
  dataAttribute?: string;

  labels: Labels;
  buttons: ButtonsOptions;
  bullets: boolean;
  progress: boolean;
  stepNumbers: boolean;

  placement: Placement;
  placementPrecedence: Side[];

  overlay: OverlayOptions;

  keyboard: boolean;
  /**
   * Exit on Esc. An Esc the host already handled (`event.defaultPrevented`)
   * is ignored, so a dialog opened on top of a step can close without ending
   * the tour. Navigation keys are exempt from that check: apps routinely
   * preventDefault arrows to stop the page from scrolling.
   */
  exitOnEsc: boolean;
  disableInteraction: boolean;

  /**
   * Mark `<body>` with `tk-tour-active` while the tour is mounted, so host
   * CSS can move its own chrome (toasts, sticky bars) out of the way.
   */
  hostClasses: boolean;

  /**
   * Freeze page scrolling while the tour runs (opt-in), compensating for the
   * scrollbar so the layout does not jump. Like `modal`, this deliberately
   * mutates the host document element and restores it on exit. Programmatic
   * scrolling to targets keeps working — only the user's own scrolling is
   * blocked. Can be overridden per step.
   */
  lockScroll: boolean;

  /**
   * Modal mode (opt-in): the tooltip gets `aria-modal="true"` and everything
   * outside the tour root is made `inert` while the tour runs. This is the
   * one deliberate exception (besides the temporary scroll-margin) to the
   * "never mutate the host DOM" rule — attributes are restored on exit.
   * Implies that the highlighted target is not interactive.
   */
  modal: boolean;

  /**
   * Wait for asynchronously mounted targets (SPA). Steps whose target is
   * missing float in the center while the DOM is watched; the spotlight
   * flows to the target once it appears. `false` disables watching.
   */
  waitForTarget: WaitForTargetOptions | false;

  scroll: ScrollOptions;

  /**
   * When `true`, step title/content are rendered as HTML.
   * Off by default: content is rendered via `textContent` (XSS-safe).
   */
  allowHTML: boolean;

  /**
   * Applied to every HTML string before it is inserted, when `allowHTML` is
   * on. Plug in DOMPurify (or an equivalent) to keep untrusted content safe:
   * `sanitize: (html) => DOMPurify.sanitize(html)`. Ignored while
   * `allowHTML` is off, where everything already goes through `textContent`.
   */
  sanitize?: (html: string) => string;

  /**
   * Show the tour only once per user: `start()` becomes a no-op after the
   * tour has been completed (or opted out via the checkbox).
   */
  showOnce?: ShowOnceOptions;

  /**
   * Multi-page tours: persists the current step index on every step change,
   * `start()` resumes from the stored index; completing or explicitly exiting
   * the tour clears the key (navigating away does not).
   */
  persistProgress?: { key: string; storage?: StorageKind };

  /** Default custom renderer for step content (per-step `renderStep` wins). */
  renderStep?: RenderStep;

  theme?: string;
  classes?: { tooltip?: string; overlay?: string; button?: string };
  zIndex?: number;
}

/** User-facing options: everything optional, nested objects partial. */
export type TourOptionsInput = Partial<
  Omit<TourOptions, "labels" | "buttons" | "overlay" | "scroll" | "waitForTarget">
> & {
  labels?: Partial<Labels>;
  buttons?: Partial<ButtonsOptions>;
  overlay?: Partial<OverlayOptions>;
  scroll?: Partial<ScrollOptions>;
  waitForTarget?: Partial<WaitForTargetOptions> | false;
};

export type Direction = "forward" | "backward";

export type CompleteReason = "finished" | "skipped";

/**
 * A type alias (not an interface): aliases get an implicit index signature,
 * which satisfies the emitter's `EventMap` constraint while `keyof TourEvents`
 * stays a closed union — typos in event names fail to compile.
 */
export type TourEvents = {
  start: (e: { steps: ReadonlyArray<Step> }) => void | Promise<void>;
  beforeStepChange: (e: {
    from: number | undefined;
    to: number;
    direction: Direction;
    step: Step;
    cancel(): void;
  }) => void | Promise<void>;
  stepChange: (e: StepContext) => void | Promise<void>;
  beforeExit: (e: { cancel(): void }) => void | Promise<void>;
  exit: (e: Record<string, never>) => void | Promise<void>;
  complete: (e: { reason: CompleteReason }) => void | Promise<void>;
};
