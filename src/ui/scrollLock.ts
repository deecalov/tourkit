/**
 * Freezes page scrolling for the duration of a tour step (`lockScroll`).
 *
 * `overflow: hidden` on the document element blocks the user's wheel, touch
 * and keyboard scrolling but leaves the element programmatically scrollable,
 * so `scrollIntoView` for the next target keeps working. Removing the
 * scrollbar would reflow the page by its width, so the same amount is added
 * as padding — the layout stays put.
 *
 * Together with `modal` this is one of the deliberate, opt-in exceptions to
 * the "never mutate the host DOM" rule: the previous inline values are
 * remembered and restored exactly.
 */
export function lockDocumentScroll(): () => void {
  const el = document.documentElement;
  const scrollbar = window.innerWidth - el.clientWidth;

  const previousOverflow = el.style.overflow;
  const previousPadding = el.style.paddingRight;
  const computed = getComputedStyle(el);

  // `scrollbar-gutter: stable` keeps the gutter reserved under overflow:
  // hidden; compensating as well would shift the layout the other way.
  const stableGutter = computed.getPropertyValue("scrollbar-gutter").includes("stable");
  if (scrollbar > 0 && !stableGutter) {
    const current = parseFloat(computed.paddingRight) || 0;
    el.style.paddingRight = `${current + scrollbar}px`;
  }
  el.style.overflow = "hidden";

  return () => {
    el.style.overflow = previousOverflow;
    el.style.paddingRight = previousPadding;
  };
}
