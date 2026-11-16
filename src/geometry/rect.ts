/** Axis-aligned rectangle in viewport coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Layout viewport rect. Uses `documentElement.clientWidth/Height`, which
 * excludes classic scrollbars and therefore matches the rendered size of
 * `position: fixed; inset: 0` elements (the tour root and the overlay).
 * `window.innerWidth` must NOT be used here: it includes the scrollbar,
 * which skews the SVG coordinate space and shifts the spotlight cutout.
 */
export function viewportRect(): Rect {
  const doc = document.documentElement;
  return {
    x: 0,
    y: 0,
    width: doc.clientWidth || window.innerWidth,
    height: doc.clientHeight || window.innerHeight,
  };
}

export function targetRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** Expand (or shrink, with negative padding) a rect on all sides. */
export function inflate(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/** Zero-size rect at the center of the given rect (used to collapse the spotlight). */
export function centerPoint(rect: Rect): Rect {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: 0, height: 0 };
}

/** Strict equality of two rects; `null` only equals `null`. */
export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max < min ? min : max);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
