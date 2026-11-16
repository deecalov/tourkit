import type { ScrollOptions } from "../core/types";
import { viewportRect } from "./rect";

/** True when the element is fully inside the viewport with a comfort margin. */
function isComfortablyVisible(el: Element, padding: number): boolean {
  const rect = el.getBoundingClientRect();
  const vp = viewportRect();

  return (
    rect.top >= vp.y + padding &&
    rect.left >= vp.x &&
    rect.bottom <= vp.y + vp.height - padding &&
    rect.right <= vp.x + vp.width
  );
}

/**
 * Scrolls the target into view using the native algorithm (which handles
 * nested scroll containers). Skipped entirely when the target is already
 * comfortably visible, so stepping through nearby elements does not
 * re-center the page on every step. The `padding` option is applied through
 * a temporary `scroll-margin`: the browser reads it synchronously during
 * `scrollIntoView`, after which the previous inline value is restored.
 */
export function scrollTargetIntoView(el: Element, options: ScrollOptions): void {
  if (options.block === "off") return;
  if (typeof (el as HTMLElement).scrollIntoView !== "function") return;
  if (isComfortablyVisible(el, options.padding)) return;

  const style = (el as HTMLElement).style;
  const previous = style?.scrollMargin ?? "";

  if (style && options.padding > 0) {
    style.scrollMargin = `${options.padding}px`;
  }

  try {
    el.scrollIntoView({ block: options.block, inline: "nearest", behavior: options.behavior });
  } finally {
    if (style && options.padding > 0) {
      style.scrollMargin = previous;
    }
  }
}
