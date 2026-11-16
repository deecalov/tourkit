import type {
  Labels,
  ScrollOptions,
  TourOptions,
  TourOptionsInput,
  WaitForTargetOptions,
} from "./types";

/** Fallback for `Labels.hintDismiss`, which is optional for compatibility. */
export const DEFAULT_HINT_DISMISS = "Got it";

export const defaultLabels: Labels = {
  next: "Next",
  back: "Back",
  done: "Done",
  skip: "Close",
  stepOf: "{step} of {total}",
  stepAnnouncement: "Step {step} of {total}",
  dontShowAgain: "Don't show this again",
  hintDismiss: DEFAULT_HINT_DISMISS,
};

export const defaultScroll: ScrollOptions = {
  block: "center",
  behavior: "smooth",
  padding: 24,
};

export function getDefaultOptions(): TourOptions {
  return {
    steps: [],
    labels: { ...defaultLabels },
    buttons: {
      next: true,
      back: true,
      skip: true,
      doneOnLast: true,
      hideBackOnFirst: false,
      hideNextOnLast: false,
    },
    bullets: true,
    progress: false,
    stepNumbers: false,

    placement: "bottom",
    placementPrecedence: ["bottom", "top", "right", "left"],

    overlay: {
      opacity: 0.5,
      // Must stay in sync with --tk-overlay-color in styles.css: the option
      // is applied as an inline CSS variable only when it differs from this
      // default (see SpotlightOverlay).
      color: "#05070a",
      padding: 8,
      radius: 8,
      clickToExit: true,
      transitionMs: 300,
    },

    keyboard: true,
    exitOnEsc: true,
    disableInteraction: false,
    hostClasses: true,
    lockScroll: false,
    modal: false,

    waitForTarget: { ...defaultWaitForTarget },

    scroll: { ...defaultScroll },

    allowHTML: false,
  };
}

export const defaultWaitForTarget: WaitForTargetOptions = {
  timeoutMs: 10000,
  onTimeout: "float",
};

/**
 * Resolves a waiting policy from a base and an optional override:
 * `false` disables watching, a partial object is filled from the base
 * (or the built-in defaults when the base itself is disabled).
 */
export function resolveWaitForTarget(
  base: WaitForTargetOptions | false,
  override?: Partial<WaitForTargetOptions> | false
): WaitForTargetOptions | false {
  if (override === false) return false;
  if (override === undefined) return base === false ? false : { ...base };
  return { ...(base === false ? defaultWaitForTarget : base), ...override };
}

/** Merge a partial user patch into full options (one level deep for known nested objects). */
export function mergeOptions(base: TourOptions, patch: TourOptionsInput): TourOptions {
  return {
    ...base,
    ...patch,
    labels: { ...base.labels, ...patch.labels },
    buttons: { ...base.buttons, ...patch.buttons },
    overlay: { ...base.overlay, ...patch.overlay },
    scroll: { ...base.scroll, ...patch.scroll },
    waitForTarget: resolveWaitForTarget(base.waitForTarget, patch.waitForTarget),
  };
}

/** Substitute `{step}` / `{total}` in a label template. */
export function formatLabel(template: string, step: number, total: number): string {
  return template.replace("{step}", String(step)).replace("{total}", String(total));
}
