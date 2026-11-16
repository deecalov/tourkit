import { getDefaultOptions } from "../core/options";
import type { OverlayOptions } from "../core/types";
import {
  centerPoint,
  clamp,
  easeInOutCubic,
  lerp,
  lerpRect,
  rectsEqual,
  viewportRect,
  type Rect,
} from "../geometry/rect";
import { caf, prefersReducedMotion, raf, svg } from "./dom";

/**
 * Full-viewport dimming with a rounded-rect cutout ("spotlight").
 *
 * Implemented as a single SVG path with `fill-rule: evenodd`: the outer
 * subpath covers the viewport, the inner subpath cuts the hole. The hole is
 * not painted, so pointer events pass through to the highlighted element
 * natively, while clicks on the dimmed area hit the path itself. Nothing in
 * the host page is modified — no z-index games, no stacking-context issues.
 *
 * The cutout "flows" from step to step via rAF interpolation of the stage
 * rect, which works in every browser (unlike CSS transitions of `d`).
 */
export class SpotlightOverlay {
  readonly el: SVGSVGElement;

  private readonly _path: SVGPathElement;
  /** Stroked outline of the cutouts — the themable "spotlight ring". */
  private readonly _ring: SVGPathElement;
  private _options: OverlayOptions;

  /** Currently painted stage (animation source). */
  private _current: Rect | null = null;
  /** Stage the animation is heading to. */
  private _stage: Rect | null = null;
  /** Extra cutouts (step.highlight); painted statically, no flow animation. */
  private _extras: Rect[] = [];
  private _radius = 0;
  private _currentRadius = 0;
  private _frame = 0;
  /** Viewport used for the last painted outer rect (dirty-check input). */
  private _paintedViewport: Rect | null = null;

  constructor(
    options: OverlayOptions,
    callbacks: { onBackdropClick: () => void },
    extraClass?: string
  ) {
    this._options = options;

    this.el = svg("svg", {
      class: `tk-overlay${extraClass ? ` ${extraClass}` : ""}`,
      "aria-hidden": "true",
    });
    this._path = svg("path", {
      class: "tk-overlay__path",
      "fill-rule": "evenodd",
    });

    this._path.addEventListener("click", () => {
      if (this._options.clickToExit) callbacks.onBackdropClick();
    });

    // The ring is transparent by default; themes brighten it via
    // --tk-spotlight-ring* variables (e.g. the dark theme). pointer-events
    // are disabled in CSS so it never blocks clicks through the cutout.
    this._ring = svg("path", { class: "tk-overlay__ring" });

    this.el.append(this._path, this._ring);
    this._applyOptionStyles();
  }

  /** Live options update (setOptions on an active tour). */
  setOptions(options: OverlayOptions): void {
    this._options = options;
    this._applyOptionStyles();
  }

  /**
   * The path is painted via CSS variables (fill: var(--tk-overlay-color)),
   * which lets themes restyle the dimming. Stylesheet rules outrank SVG
   * presentation attributes, so options must be applied as inline custom
   * properties — and only when they differ from the defaults, to keep
   * CSS-level theming working for untouched options.
   */
  private _applyOptionStyles(): void {
    const options = this._options;
    const defaults = getDefaultOptions().overlay;

    if (options.color !== defaults.color) {
      this.el.style.setProperty("--tk-overlay-color", options.color);
    } else {
      this.el.style.removeProperty("--tk-overlay-color");
    }
    if (options.opacity !== defaults.opacity) {
      this.el.style.setProperty("--tk-overlay-opacity", String(options.opacity));
    } else {
      this.el.style.removeProperty("--tk-overlay-opacity");
    }

    this._path.style.cursor = options.clickToExit ? "pointer" : "";
  }

  /**
   * Moves the main cutout to a new stage rect (viewport coordinates, padding
   * already applied). `null` collapses the cutout to the viewport center —
   * used for floating steps so the transition stays continuous.
   * `extras` are additional cutouts painted as-is (no flow animation).
   */
  setStage(stage: Rect | null, animate: boolean, extras: Rect[] = []): void {
    const to = stage ?? centerPoint(viewportRect());
    const toRadius = stage ? this._radiusFor(stage) : 0;

    const from = this._current ?? centerPoint(viewportRect());
    const fromRadius = this._current ? this._currentRadius : 0;

    this._stage = to;
    this._radius = toRadius;
    this._extras = extras;
    this._cancelAnimation();

    if (!animate || !this._current || this._options.transitionMs <= 0 || prefersReducedMotion()) {
      this._paint(to, toRadius);
      return;
    }

    const started = performance.now();
    const duration = this._options.transitionMs;

    const tick = (now: number) => {
      const t = clamp((now - started) / duration, 0, 1);
      const eased = easeInOutCubic(t);
      this._paint(lerpRect(from, to, eased), lerp(fromRadius, toRadius, eased));
      if (t < 1) {
        this._frame = raf(tick);
      } else {
        this._frame = 0;
      }
    };

    this._frame = raf(tick);
  }

  /**
   * Instant repaint at a new stage (scroll/resize sync); does not animate.
   * Dirty-checked: the SVG path rebuild is skipped entirely when the painted
   * geometry (stage, radius, extras, viewport) is unchanged — the common case
   * when a nested container scrolls without moving the target relative to
   * the viewport. A flow animation already heading to exactly this geometry
   * is left running; any real change lands instantly at the new geometry.
   */
  refresh(stage: Rect | null, extras: Rect[] = []): void {
    const next = stage ?? centerPoint(viewportRect());
    const nextRadius = stage ? this._radiusFor(stage) : 0;

    const inputsClean =
      extrasEqual(this._extras, extras) && rectsEqual(this._paintedViewport, viewportRect());

    if (this._frame !== 0) {
      if (inputsClean && rectsEqual(this._stage, next) && this._radius === nextRadius) return;
      this._cancelAnimation();
    } else if (
      inputsClean &&
      rectsEqual(this._current, next) &&
      this._currentRadius === nextRadius
    ) {
      return;
    }

    this._stage = next;
    this._radius = nextRadius;
    this._extras = extras;
    this._paint(next, nextRadius);
  }

  destroy(): void {
    this._cancelAnimation();
    this.el.remove();
  }

  private _radiusFor(stage: Rect): number {
    return Math.min(this._options.radius, stage.width / 2, stage.height / 2);
  }

  private _cancelAnimation(): void {
    if (this._frame) {
      caf(this._frame);
      this._frame = 0;
    }
  }

  private _paint(stage: Rect, radius: number): void {
    this._current = stage;
    this._currentRadius = radius;

    // No viewBox on purpose: without it SVG user units map 1:1 to the CSS
    // pixels of the element, so cutout coordinates coming from
    // getBoundingClientRect() land exactly on the highlighted element.
    // A viewBox based on window.innerWidth would be scaled down to the
    // element size (which excludes the scrollbar), shifting the cutout.
    const vp = viewportRect();
    this._paintedViewport = vp;
    const outer = `M0 0H${vp.width}V${vp.height}H0Z`;
    const inner = roundedRectPath(stage, radius);
    const extras = this._extras
      .map((rect) => roundedRectPath(rect, this._radiusFor(rect)))
      .join(" ");
    this._path.setAttribute("d", `${outer} ${inner}${extras ? ` ${extras}` : ""}`);

    // Ring: cutout outlines only; skip the collapsed (centered) stage so a
    // stroked dot never flashes in the middle of the screen.
    const ringParts = [stage.width > 0 && stage.height > 0 ? inner : "", extras]
      .filter(Boolean)
      .join(" ");
    this._ring.setAttribute("d", ringParts);
  }
}

function extrasEqual(a: Rect[], b: Rect[]): boolean {
  return a.length === b.length && a.every((rect, i) => rectsEqual(rect, b[i] ?? null));
}

/** SVG subpath for a rounded rectangle (arc corners). */
export function roundedRectPath(rect: Rect, radius: number): string {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const { x, y, width: w, height: hgt } = rect;

  if (w <= 0 || hgt <= 0) {
    return `M${x} ${y}h0v0h0Z`;
  }

  return (
    `M${x + r} ${y}` +
    `h${w - 2 * r}` +
    `a${r} ${r} 0 0 1 ${r} ${r}` +
    `v${hgt - 2 * r}` +
    `a${r} ${r} 0 0 1 ${-r} ${r}` +
    `h${-(w - 2 * r)}` +
    `a${r} ${r} 0 0 1 ${-r} ${-r}` +
    `v${-(hgt - 2 * r)}` +
    `a${r} ${r} 0 0 1 ${r} ${-r}` +
    `Z`
  );
}
