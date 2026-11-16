import { resolveTarget } from "../core/engine";
import { getDefaultOptions } from "../core/options";
import type { OverlayOptions, ScrollOptions, TargetRef } from "../core/types";
import { createAutoUpdater, type AutoUpdater } from "../geometry/autoUpdate";
import { inflate, targetRect, type Rect } from "../geometry/rect";
import { scrollTargetIntoView } from "../geometry/scrollIntoView";
import { h, raf } from "../ui/dom";
import { acquireHostClass, HIGHLIGHT_ACTIVE_CLASS } from "../ui/hostFlags";
import { SpotlightOverlay } from "../ui/overlay";

export interface HighlightOptions {
  overlay?: Partial<OverlayOptions>;
  /** Scroll the target into view; `false` disables. */
  scroll?: Partial<ScrollOptions> | false;
  /**
   * Dismiss on Esc (default true), unless the host already handled that Esc
   * (`event.defaultPrevented`). Backdrop clicks obey `overlay.clickToExit`.
   */
  exitOnEsc?: boolean;
  /** Mark `<body>` with `tk-highlight-active` while the spotlight is up. */
  hostClasses?: boolean;
  theme?: string;
  zIndex?: number;
  container?: Element;
  /** Scope for resolving string selectors (e.g. a `ShadowRoot`). */
  root?: Document | ShadowRoot | Element;
  classes?: { overlay?: string };
}

/** Per-call overrides for `Highlight.move`. */
export interface HighlightMoveOptions {
  /** Scroll the new target into view (default: the instance's `scroll` policy). */
  scroll?: boolean;
}

export interface Highlight {
  /**
   * Moves the spotlight to another target: the cutout flows to it and the
   * page scrolls it into view. Pass `{ scroll: false }` when the caller is
   * only re-pointing at an equivalent element (a re-rendered node) and the
   * viewport must stay where the user left it.
   */
  move(target: TargetRef, options?: HighlightMoveOptions): void;
  /**
   * Re-syncs the cutout with the current DOM geometry. Cheap and silent: no
   * animation, no scrolling. A string or function target is resolved again,
   * so a target replaced by a re-render is picked up automatically.
   */
  refresh(): void;
  /** Removes the spotlight and all listeners. */
  destroy(): void;
  readonly isActive: boolean;
}

const noopHighlight: Highlight = {
  move: () => {},
  refresh: () => {},
  destroy: () => {},
  isActive: false,
};

/**
 * Standalone spotlight without a tour: dims the page and cuts a hole around
 * the target — no tooltip, no focus management. Reuses the tour's overlay,
 * geometry tracking and scrolling, so it works inside transform/filter
 * stacking contexts and follows the target on scroll/resize.
 */
export function highlight(target: TargetRef, options: HighlightOptions = {}): Highlight {
  if (typeof window === "undefined" || typeof document === "undefined") {
    console.warn("[tourkit] highlight() is a no-op outside the browser.");
    return noopHighlight;
  }

  const defaults = getDefaultOptions();
  const overlayOptions: OverlayOptions = { ...defaults.overlay, ...options.overlay };
  const scrollOptions: ScrollOptions | false =
    options.scroll === false ? false : { ...defaults.scroll, ...options.scroll };
  const exitOnEsc = options.exitOnEsc ?? true;

  let currentTarget: TargetRef = target;
  let active = true;

  const root = h("div", { className: "tk-root tk-highlight" });
  if (options.theme) root.dataset["tkTheme"] = options.theme;
  if (options.zIndex !== undefined) root.style.setProperty("--tk-z", String(options.zIndex));

  const overlay = new SpotlightOverlay(
    overlayOptions,
    { onBackdropClick: () => api.destroy() },
    options.classes?.overlay
  );
  root.append(overlay.el);
  (options.container ?? document.body).append(root);
  raf(() => root.classList.add("tk-root--visible"));

  const releaseHostClass =
    options.hostClasses === false ? null : acquireHostClass(HIGHLIGHT_ACTIVE_CLASS);

  const stageRect = (): Rect | null => {
    const el = resolveTarget(currentTarget, options.root);
    if (!el || !el.isConnected) return null;
    const rect = targetRect(el);
    if (rect.width === 0 && rect.height === 0) return null;
    return inflate(rect, overlayOptions.padding);
  };

  const present = (animate: boolean, scroll = true) => {
    const el = resolveTarget(currentTarget, options.root);
    if (el && scrollOptions && scroll) scrollTargetIntoView(el, scrollOptions);
    overlay.setStage(stageRect(), animate);
    updater.setElements([el]);
  };

  const updater: AutoUpdater = createAutoUpdater(() => overlay.refresh(stageRect()));

  const onKeyDown = (e: KeyboardEvent) => {
    // Esc the host already consumed (its own dialog) must not also kill the
    // spotlight — see the same guard in the tour renderer.
    if (e.key === "Escape" && exitOnEsc && !e.defaultPrevented) {
      e.preventDefault();
      api.destroy();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  const api: Highlight = {
    move(next, moveOptions) {
      if (!active) return;
      currentTarget = next;
      present(true, moveOptions?.scroll ?? true);
    },

    refresh() {
      if (!active) return;
      overlay.refresh(stageRect());
    },

    destroy() {
      if (!active) return;
      active = false;
      document.removeEventListener("keydown", onKeyDown);
      updater.stop();
      overlay.destroy();
      root.remove();
      releaseHostClass?.();
    },

    get isActive() {
      return active;
    },
  };

  present(false);
  return api;
}
