import type { ScrollOptions } from "../core/types";
import { viewportRect } from "./rect";

const SIDES = ["top", "right", "bottom", "left"] as const;

/** Parent element, crossing shadow boundaries (the host's scrollers clip too). */
const parentOf = (el: Element): Element | null =>
  el.parentElement ?? (el.getRootNode() as Partial<ShadowRoot>).host ?? null;

/**
 * True when the element is fully inside the viewport, minus the comfort
 * margins (top, right, bottom, left), and not scrolled out of a nested
 * scroller. A sidebar or list can hide the element while its rect sits well
 * inside the viewport; then the native scrollIntoView has to run. Only
 * user-scrollable containers count: an `overflow: hidden` widget (carousel,
 * truncated text) is left alone.
 */
function isComfortablyVisible(el: Element, [top, right, bottom, left]: number[]): boolean {
  const r = el.getBoundingClientRect();
  const vp = viewportRect();
  let visible =
    r.top >= top! &&
    r.left >= left! &&
    r.bottom <= vp.height - bottom! &&
    r.right <= vp.width - right!;

  for (
    let node = parentOf(el);
    visible && node && node !== document.body && node !== document.documentElement;
    node = parentOf(node)
  ) {
    const style = getComputedStyle(node);
    // The shorthand too: jsdom does not expand `overflow` into its longhands.
    if (/auto|scroll/.test(style.overflow + style.overflowX + style.overflowY)) {
      const box = node.getBoundingClientRect();
      const y = box.top + node.clientTop;
      const x = box.left + node.clientLeft;
      visible =
        r.top >= y &&
        r.left >= x &&
        r.bottom <= y + node.clientHeight &&
        r.right <= x + node.clientWidth;
    }
  }
  return visible;
}

/**
 * Scrolls the target into view using the native algorithm (which handles
 * nested scroll containers). Skipped entirely when the target is already
 * comfortably visible, so stepping through nearby elements does not
 * re-center the page on every step.
 *
 * The `padding` option is applied through a temporary `scroll-margin`, which
 * the browser reads synchronously during `scrollIntoView`. A larger margin
 * the host already declared (`scroll-margin-top` under a sticky header) wins
 * per side, in the visibility check as well. Longhands are set and restored
 * one by one: restoring through the shorthand would wipe an inline
 * `scroll-margin-top` of the page.
 */
export function scrollTargetIntoView(el: Element, options: ScrollOptions): void {
  if (options.block === "off" || typeof (el as HTMLElement).scrollIntoView !== "function") return;

  const pad = options.padding;
  const computed = getComputedStyle(el);
  const host = SIDES.map(
    (side) => parseFloat(computed.getPropertyValue(`scroll-margin-${side}`)) || 0
  );
  // The comfort padding has always been vertical-only in this check.
  const comfort = host.map((m, i) => (i % 2 ? m : Math.max(m, pad)));
  if (isComfortablyVisible(el, comfort)) return;

  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  const apply = (values: string[]) =>
    SIDES.forEach((side, i) =>
      values[i]
        ? style!.setProperty(`scroll-margin-${side}`, values[i]!)
        : style!.removeProperty(`scroll-margin-${side}`)
    );
  const previous = SIDES.map((side) => style?.getPropertyValue(`scroll-margin-${side}`) ?? "");
  const temporary = style && pad > 0;
  if (temporary) apply(host.map((m) => `${Math.max(m, pad)}px`));

  try {
    el.scrollIntoView({ block: options.block, inline: "nearest", behavior: options.behavior });
  } finally {
    if (temporary) apply(previous);
  }
}
