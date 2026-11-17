export interface ElementProps {
  className?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  on?: Partial<Record<"click" | "change" | "keydown", (e: Event) => void>>;
}

/** Tiny hyperscript helper for HTML elements. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: Array<Element | string | null | undefined> = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props.className) el.className = props.className;
  if (props.text !== undefined) el.textContent = props.text;

  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === undefined || value === false) continue;
      el.setAttribute(name, value === true ? "" : String(value));
    }
  }

  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      if (handler) el.addEventListener(event, handler);
    }
  }

  for (const child of children) {
    if (child == null) continue;
    el.append(child);
  }

  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  return el;
}

/**
 * Renders step-provided text into a container.
 * With `allowHTML` disabled (the default) the value goes through `textContent`,
 * which makes user-supplied strings inert (XSS-safe). When HTML is allowed,
 * an optional `sanitize` hook gets the last word before insertion.
 */
export function setContent(
  el: HTMLElement,
  value: string,
  allowHTML: boolean,
  sanitize?: (html: string) => string
): void {
  if (!allowHTML) {
    el.textContent = value;
    return;
  }
  el.innerHTML = sanitize ? sanitize(value) : value;
}

/**
 * Text for an attribute such as `aria-label`. With `allowHTML` the value is
 * markup, and tags must not leak into the accessible name; it is parsed in an
 * inert document (no script runs, no image loads), never through innerHTML.
 */
export function plainText(
  value: string,
  allowHTML: boolean,
  sanitize?: (html: string) => string
): string {
  if (!allowHTML) return value;
  const doc = new DOMParser().parseFromString(sanitize ? sanitize(value) : value, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Focus is inside an open hint popover — the topmost TourKit layer, which
 * owns the next Esc. Tours and spotlights let it through, whichever of them
 * registered its document listener first.
 */
export function inHintPopover(el: Element | null): boolean {
  return el?.closest(".tk-hint-popover") != null;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const FRAME_MS = 16;

/**
 * `requestAnimationFrame` with a timer fallback. Frame callbacks are
 * scheduled from observers (MutationObserver, ResizeObserver) that can fire
 * in environments without rAF — a non-visual jsdom, or a document being torn
 * down — where an unguarded call throws an uncaught ReferenceError.
 */
export function raf(callback: (time: number) => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  const timer = setTimeout(() => callback(timestamp()), FRAME_MS);
  return timer as unknown as number;
}

function timestamp(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function caf(handle: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

/**
 * True when the element is not rendered or invisible: `display: none` (own
 * or ancestral), `visibility: hidden`, a closed `<details>` etc. Used by the
 * declarative scanners to skip elements that cannot be toured or hinted.
 *
 * Prefers `Element.checkVisibility()` (sees ancestor hiding); the
 * computed-style fallback only inspects the element's own declarations.
 */
export function isElementHidden(el: Element): boolean {
  if (typeof el.checkVisibility === "function") {
    return !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
  }
  const style = getComputedStyle(el);
  return style.display === "none" || style.visibility === "hidden";
}

let uid = 0;

/** Unique DOM id for aria-labelledby/aria-describedby wiring. */
export function nextId(prefix: string): string {
  uid += 1;
  return `tk-${prefix}-${uid}`;
}
