import { Emitter } from "../core/emitter";
import { resolveTarget } from "../core/engine";
import { DEFAULT_HINT_DISMISS, definedOnly, defaultScroll } from "../core/options";
import { resolveStorage, type StorageKind } from "../core/storage";
import type { Labels, Placement, ScrollOptions, Side, TargetRef } from "../core/types";
import { createAutoUpdater, type AutoUpdater } from "../geometry/autoUpdate";
import { isPlacement, resolvePlacement } from "../geometry/placement";
import { targetRect, viewportRect, type Rect } from "../geometry/rect";
import { scrollTargetIntoView } from "../geometry/scrollIntoView";
import { h, isElementHidden, nextId, plainText, setContent } from "../ui/dom";
import { activeElement, trapFocus } from "../ui/focus";
import { acquireHostClass, HINTS_OPEN_CLASS } from "../ui/hostFlags";

export type MarkerAnchor = `${"top" | "middle" | "bottom"}-${"start" | "center" | "end"}`;

export interface HintInput {
  target: TargetRef;
  content: string;
  /** Stable identity used for dismiss persistence; defaults to the list index. */
  id?: string;
  /** Where the marker dot sits on the target. */
  markerPosition?: MarkerAnchor;
  /** Popover placement relative to the marker. */
  placement?: Placement;
}

export interface Hint extends HintInput {
  id: string;
  markerPosition: MarkerAnchor;
  placement: Placement;
  dismissed: boolean;
}

export interface HintsOptions {
  hints?: HintInput[];
  container?: Element;
  /**
   * Scope for resolving string selectors and scanning `[data-hint]`.
   * Pass a `ShadowRoot` to hint elements inside a web component.
   */
  root?: Document | ShadowRoot | Element;

  marker?: { pulse?: boolean };
  /** `buttonLabel` overrides `labels.hintDismiss` for this instance. */
  popover?: { button?: boolean; buttonLabel?: string };

  /**
   * Label set, shared with tours: `createHints({ labels: ru })`. Only the
   * hint-related entries are used (`hintDismiss`).
   */
  labels?: Partial<Labels>;

  placement?: Placement;
  placementPrecedence?: Side[];
  markerPosition?: MarkerAnchor;

  /**
   * Scroll the hint's target into view when a popover is opened. Off by
   * default: a click on a visible marker must not move the page. Turn it on
   * for programmatic `open(i)` calls, where the marker may be off screen.
   */
  scroll?: Partial<ScrollOptions>;

  /**
   * Mark `<body>` with `tk-hints-open` while a popover is open, so host CSS
   * can react (dim its own chrome, pause animations).
   */
  hostClasses?: boolean;

  /** Render popover content as HTML (off by default, XSS-safe). */
  allowHTML?: boolean;
  /** Sanitizer applied to popover HTML when `allowHTML` is on (e.g. DOMPurify). */
  sanitize?: (html: string) => string;

  /** Persist dismissed hints under this key so they stay hidden after reload. */
  rememberDismissed?: { key: string; storage?: StorageKind };

  theme?: string;
  zIndex?: number;
}

/** Per-call overrides for `Hints.open`. */
export interface HintOpenOptions {
  /** Scroll the target into view first (default: the instance's `scroll` policy). */
  scroll?: boolean;
}

/** Type alias on purpose: closed `keyof` union, typos fail to compile. */
export type HintsEvents = {
  open: (e: { index: number; hint: Hint }) => void | Promise<void>;
  dismiss: (e: { index: number; hint: Hint }) => void | Promise<void>;
};

export interface Hints {
  /** Mounts markers (scans `[data-hint]` when no hints are configured). */
  render(): Hints;
  /**
   * Adds a hint at runtime (renders the instance first when needed).
   * A persisted dismissal for the same `id` is respected.
   * Returns the index of the new hint.
   */
  add(input: HintInput): number;
  /** Removes a hint by index or id; an open popover for it is closed. */
  remove(ref: number | string): void;
  /**
   * Opens the hint's popover (calling it for the open hint closes it).
   * `{ scroll: true }` brings an off-screen marker into view first — the
   * popover of a marker clamped at the edge would otherwise open outside
   * the viewport.
   */
  open(index: number, options?: HintOpenOptions): void;
  close(): void;
  /** Shows the marker; a dismissed hint is revived (its dismissal is cleared). */
  show(index: number): void;
  hide(index: number): void;
  hideAll(): void;
  /** Hides the hint permanently (persisted with `rememberDismissed`). */
  dismiss(index: number): void;
  refresh(): void;
  destroy(): void;
  readonly hints: ReadonlyArray<Hint>;
  on<E extends keyof HintsEvents & string>(event: E, handler: HintsEvents[E]): () => void;
  once<E extends keyof HintsEvents & string>(event: E, handler: HintsEvents[E]): () => void;
}

const CONTENT_ATTR = "data-hint";
const POSITION_ATTR = "data-hint-position";
const PLACEMENT_ATTR = "data-hint-placement";
const ID_ATTR = "data-hint-id";

// `left`/`right` are accepted as physical spellings of the logical axis, so
// markup migrated from intro.js keeps working.
const ANCHOR_RE = /^(top|middle|bottom)-(start|center|end|left|right)$/;

function readAnchor(el: Element): MarkerAnchor | undefined {
  const raw = el.getAttribute(POSITION_ATTR);
  if (raw === null) return undefined;

  if (ANCHOR_RE.test(raw)) {
    return raw.replace("-left", "-start").replace("-right", "-end") as MarkerAnchor;
  }
  console.warn(`[tourkit] unknown ${POSITION_ATTR}="${raw}"; using the default anchor.`);
  return undefined;
}

/** Collects hints declared in HTML via `data-hint*` attributes. */
export function fromHintAttributes(root?: ParentNode): HintInput[] {
  if (root === undefined && typeof document === "undefined") {
    console.warn("[tourkit] fromHintAttributes() found no document; returning no hints.");
    return [];
  }

  return Array.from((root ?? document).querySelectorAll<HTMLElement>(`[${CONTENT_ATTR}]`))
    .filter((el) => el.getAttribute(CONTENT_ATTR) && !isElementHidden(el))
    .map((el) => {
      const placement = el.getAttribute(PLACEMENT_ATTR);
      if (placement !== null && !isPlacement(placement)) {
        console.warn(`[tourkit] unknown ${PLACEMENT_ATTR}="${placement}"; using the default.`);
      }
      return {
        target: el,
        content: el.getAttribute(CONTENT_ATTR)!,
        id: el.getAttribute(ID_ATTR) ?? undefined,
        markerPosition: readAnchor(el),
        placement: isPlacement(placement) ? placement : undefined,
      };
    });
}

/** Marker anchor point on the target rect; start/end are logical (RTL-aware). */
export function markerAnchorPoint(
  rect: Rect,
  anchor: MarkerAnchor,
  rtl: boolean
): { x: number; y: number } {
  const [v, rawH] = anchor.split("-") as ["top" | "middle" | "bottom", "start" | "center" | "end"];

  let horizontal = rawH;
  if (rtl && horizontal !== "center") {
    horizontal = horizontal === "start" ? "end" : "start";
  }

  return {
    x:
      horizontal === "start"
        ? rect.x
        : horizontal === "end"
          ? rect.x + rect.width
          : rect.x + rect.width / 2,
    y: v === "top" ? rect.y : v === "bottom" ? rect.y + rect.height : rect.y + rect.height / 2,
  };
}

export function createHints(options: HintsOptions = {}): Hints {
  const events = new Emitter<HintsEvents>();

  const placementPrecedence = options.placementPrecedence ?? ["bottom", "top", "right", "left"];
  const defaultAnchor = options.markerPosition ?? "middle-end";
  const pulse = options.marker?.pulse ?? true;
  const withButton = options.popover?.button ?? true;
  // The explicit label wins over the locale so existing configs keep working.
  const buttonLabel =
    options.popover?.buttonLabel ?? options.labels?.hintDismiss ?? DEFAULT_HINT_DISMISS;
  const scrollOnOpen = options.scroll !== undefined;

  let hints: Hint[] = [];
  let root: HTMLDivElement | null = null;
  let popover: HTMLDivElement | null = null;
  let openIndex: number | null = null;
  let markers: Array<HTMLButtonElement | null> = [];
  let updater: AutoUpdater | null = null;
  let stopDocListeners: (() => void) | null = null;
  let releaseTrap: (() => void) | null = null;
  let releaseHostClass: (() => void) | null = null;
  const popoverId = nextId("hint-popover");

  const storage = () => resolveStorage(options.rememberDismissed?.storage);

  const readDismissed = (): Set<string> => {
    if (!options.rememberDismissed) return new Set();
    try {
      const raw = storage().get(options.rememberDismissed.key);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  };

  const persistDismissed = () => {
    if (!options.rememberDismissed) return;
    // Read-merge-write: the key may be shared across pages/groups, so IDs
    // belonging to hints this instance does not know about must survive.
    const stored = readDismissed();
    for (const hintItem of hints) {
      if (hintItem.dismissed) {
        stored.add(hintItem.id);
      } else {
        stored.delete(hintItem.id);
      }
    }
    storage().set(options.rememberDismissed.key, JSON.stringify([...stored]));
  };

  const isRtl = () => root !== null && getComputedStyle(root).direction === "rtl";

  const positionMarker = (index: number, rtl = isRtl()) => {
    const marker = markers[index];
    const hint = hints[index];
    if (!marker || !hint) return;

    const el = resolveTarget(hint.target, options.root);
    if (!el || !el.isConnected) {
      if (marker.style.display !== "none") marker.style.display = "none";
      return;
    }

    const rect = targetRect(el);
    // A connected but hidden target (display: none) reports a zero rect at
    // the origin — hide the marker instead of pinning a dot to (0,0).
    if (rect.width === 0 && rect.height === 0) {
      if (marker.style.display !== "none") marker.style.display = "none";
      return;
    }

    if (!hint.dismissed && marker.style.display !== "") marker.style.display = "";
    const point = markerAnchorPoint(rect, hint.markerPosition, rtl);
    const left = `${Math.round(point.x)}px`;
    const top = `${Math.round(point.y)}px`;
    if (marker.style.left !== left) marker.style.left = left;
    if (marker.style.top !== top) marker.style.top = top;
  };

  const positionPopover = (rtl = isRtl()) => {
    if (!popover || openIndex === null) return;
    const marker = markers[openIndex];
    if (!marker) return;

    const anchor = targetRect(marker);
    const size = { width: popover.offsetWidth, height: popover.offsetHeight };
    const resolved = resolvePlacement(
      hints[openIndex]!.placement,
      anchor,
      size,
      viewportRect(),
      placementPrecedence,
      { gap: 10, rtl }
    );
    const left = `${Math.round(resolved.x)}px`;
    const top = `${Math.round(resolved.y)}px`;
    if (popover.style.left !== left) popover.style.left = left;
    if (popover.style.top !== top) popover.style.top = top;
  };

  const syncAll = () => {
    const rtl = isRtl();
    hints.forEach((_, i) => positionMarker(i, rtl));
    positionPopover(rtl);
  };

  const close = () => {
    if (openIndex === null) return;
    const marker = markers[openIndex];
    // Hand focus back to the marker only when it was inside the popover (Esc,
    // the dismiss button): an outside click has already moved focus where
    // the user wanted it — into a field, say — and must not lose it.
    const refocus = popover?.contains(activeElement()) ?? false;
    marker?.setAttribute("aria-expanded", "false");
    marker?.removeAttribute("aria-controls");
    openIndex = null;
    releaseTrap?.();
    releaseTrap = null;
    popover?.remove();
    popover = null;
    releaseHostClass?.();
    releaseHostClass = null;
    if (refocus) marker?.focus({ preventScroll: true });
  };

  /** Accessible name of a hint: its content as plain text, even with allowHTML. */
  const labelOf = (hint: Hint) =>
    plainText(hint.content, options.allowHTML ?? false, options.sanitize);

  const open = (index: number, openOptions?: HintOpenOptions) => {
    const hint = hints[index];
    const marker = markers[index];
    if (!hint || !marker || hint.dismissed || !root) return;

    if (openIndex === index) {
      close();
      return;
    }
    close();

    // Scrolling before measuring: the popover is placed against the marker,
    // which the auto-updater re-anchors to the target as the page moves.
    if (openOptions?.scroll ?? scrollOnOpen) {
      const el = resolveTarget(hint.target, options.root);
      if (el) scrollTargetIntoView(el, { ...defaultScroll, ...definedOnly(options.scroll) });
      syncAll();
    }

    openIndex = index;
    marker.setAttribute("aria-expanded", "true");
    // aria-controls is only valid while the referenced popover exists in the DOM.
    marker.setAttribute("aria-controls", popoverId);

    const content = h("div", { className: "tk-hint-popover__content" });
    setContent(content, hint.content, options.allowHTML ?? false, options.sanitize);

    popover = h(
      "div",
      {
        className: "tk-hint-popover",
        attrs: { role: "dialog", "aria-label": labelOf(hint), id: popoverId, tabindex: -1 },
      },
      [
        content,
        withButton
          ? h("button", {
              className: "tk-button tk-button--primary tk-hint-popover__button",
              text: buttonLabel,
              attrs: { type: "button" },
              on: { click: () => api.dismiss(index) },
            })
          : null,
      ]
    );

    root.append(popover);
    positionPopover();

    releaseTrap = trapFocus(popover);
    (popover.querySelector<HTMLElement>(".tk-hint-popover__button") ?? popover).focus({
      preventScroll: true,
    });
    if (options.hostClasses !== false) releaseHostClass = acquireHostClass(HINTS_OPEN_CLASS);

    void events.emit("open", { index, hint });
  };

  const setMarkerVisible = (index: number, visible: boolean) => {
    const hint = hints[index];
    if (!hint) return;
    markers[index]?.classList.toggle("tk-hint--hidden", !visible);
    if (!visible && openIndex === index) close();
  };

  const normalizeHint = (input: HintInput, id: string, dismissed: Set<string>): Hint => ({
    ...input,
    id,
    markerPosition: input.markerPosition ?? defaultAnchor,
    placement: input.placement ?? options.placement ?? "bottom",
    dismissed: dismissed.has(id),
  });

  /**
   * Auto-id for `add()` without an explicit one. The list index is not usable:
   * after a `remove()` the next `add()` would reuse an id that still belongs
   * to a shifted hint, and both would share its persisted dismissal.
   */
  const autoId = (): string => {
    const taken = new Set(hints.map((item) => item.id));
    let n = hints.length;
    let candidate = String(n);
    while (taken.has(candidate)) {
      n += 1;
      candidate = String(n);
    }
    return candidate;
  };

  /**
   * Markers close over the hint object, not its index: `add`/`remove`
   * shift positions, so the index is looked up at click time.
   */
  const createMarker = (hint: Hint): HTMLButtonElement =>
    h(
      "button",
      {
        className: `tk-hint${hint.dismissed ? " tk-hint--hidden" : ""}${pulse ? "" : " tk-hint--static"}`,
        attrs: {
          type: "button",
          "aria-label": labelOf(hint),
          "aria-expanded": "false",
          "aria-haspopup": "dialog",
        },
        on: {
          click: (e) => {
            e.stopPropagation();
            open(hints.indexOf(hint));
          },
        },
      },
      [pulse ? h("span", { className: "tk-hint__pulse", attrs: { "aria-hidden": "true" } }) : null]
    );

  /** Re-stamps `data-hint-index` after any splice so DOM hooks stay correct. */
  const resyncIndexes = () => {
    markers.forEach((marker, i) => marker?.setAttribute("data-hint-index", String(i)));
  };

  /** Updates the set of observed targets (markers follow them on scroll/resize). */
  const syncObserved = () => {
    updater?.setElements(hints.map((hintItem) => resolveTarget(hintItem.target, options.root)));
  };

  const api: Hints = {
    render() {
      if (root || typeof document === "undefined") return api;

      const inputs = options.hints?.length ? options.hints : fromHintAttributes(options.root);
      const dismissed = readDismissed();

      hints = inputs.map((input, i) => normalizeHint(input, input.id ?? String(i), dismissed));

      root = h("div", { className: "tk-root tk-root--visible tk-hints" });
      if (options.theme) root.dataset["tkTheme"] = options.theme;
      if (options.zIndex !== undefined) root.style.setProperty("--tk-z", String(options.zIndex));

      markers = hints.map((hint) => {
        const marker = createMarker(hint);
        root!.append(marker);
        return marker;
      });
      resyncIndexes();

      (options.container ?? document.body).append(root);

      updater = createAutoUpdater(syncAll);
      syncObserved();
      syncAll();

      const onDocClick = (e: MouseEvent) => {
        if (popover && !popover.contains(e.target as Node)) close();
      };
      const onKeyDown = (e: KeyboardEvent) => {
        // Esc consumed by the host (its own dialog above the popover) must not
        // close the popover as well.
        if (e.key !== "Escape" || e.defaultPrevented || openIndex === null) return;
        // Consumed here: a tour or spotlight under the popover keeps running.
        e.preventDefault();
        close();
      };
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKeyDown);
      stopDocListeners = () => {
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKeyDown);
      };

      return api;
    },

    add(input) {
      if (typeof document === "undefined") return -1;
      if (!root) api.render();

      const hint = normalizeHint(input, input.id ?? autoId(), readDismissed());
      hints.push(hint);

      const marker = createMarker(hint);
      markers.push(marker);
      root!.append(marker);

      resyncIndexes();
      syncObserved();
      const index = hints.length - 1;
      positionMarker(index);
      return index;
    },

    remove(ref) {
      const index = typeof ref === "number" ? ref : hints.findIndex((item) => item.id === ref);
      const hint = hints[index];
      if (!hint) return;

      if (openIndex === index) close();
      hints.splice(index, 1);
      const [marker] = markers.splice(index, 1);
      marker?.remove();
      // The open popover belongs to a hint that just shifted left.
      if (openIndex !== null && index < openIndex) openIndex -= 1;

      resyncIndexes();
      syncObserved();
    },

    open,
    close,

    show(index) {
      const hint = hints[index];
      if (!hint) return;
      // Re-showing a dismissed hint revives it fully: the marker becomes
      // clickable again and the dismissal is removed from persistence.
      if (hint.dismissed) {
        hint.dismissed = false;
        persistDismissed();
      }
      setMarkerVisible(index, true);
      positionMarker(index);
    },
    hide: (index) => setMarkerVisible(index, false),
    hideAll() {
      hints.forEach((_, i) => setMarkerVisible(i, false));
    },

    dismiss(index) {
      const hint = hints[index];
      if (!hint || hint.dismissed) return;
      hint.dismissed = true;
      setMarkerVisible(index, false);
      persistDismissed();
      void events.emit("dismiss", { index, hint });
    },

    refresh: syncAll,

    destroy() {
      releaseTrap?.();
      releaseTrap = null;
      close();
      updater?.stop();
      updater = null;
      stopDocListeners?.();
      stopDocListeners = null;
      root?.remove();
      root = null;
      markers = [];
      // The hint list is part of the mounted state: leaving it behind would
      // let `hints` report phantom entries and `add()` (which re-renders)
      // rebuild the list on top of them.
      hints = [];
      openIndex = null;
      events.removeAll();
    },

    get hints() {
      return hints;
    },

    on: (event, handler) => events.on(event, handler),
    once: (event, handler) => events.once(event, handler),
  };

  return api;
}
