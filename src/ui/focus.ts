const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Captures the currently focused element; returns a function that restores focus to it. */
export function rememberFocus(): () => void {
  const previous = document.activeElement;
  return () => {
    if (previous instanceof HTMLElement && previous.isConnected) {
      previous.focus({ preventScroll: true });
    }
  };
}

/**
 * True when the element is rendered and can take keyboard focus.
 * Prefers `checkVisibility()`; the legacy fallback treats a null
 * `offsetParent` as hidden — except for `position: fixed` elements, whose
 * `offsetParent` is null by spec even when they are perfectly visible
 * (fixed toolbars and FABs are classic tour targets).
 */
function isFocusableVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el === document.activeElement) return true;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
  }
  return el.offsetParent !== null || getComputedStyle(el).position === "fixed";
}

/**
 * Focusable elements of a root, including the root itself when it qualifies
 * and anything inside open shadow trees (a selector query stops at the shadow
 * boundary, so hosts are walked explicitly).
 */
function collectFocusables(root: Element | ShadowRoot): HTMLElement[] {
  const list: HTMLElement[] = [];

  const walk = (node: Element | ShadowRoot) => {
    if (node instanceof HTMLElement && node.matches(FOCUSABLE)) list.push(node);
    for (const el of node.querySelectorAll<HTMLElement>("*")) {
      if (el.matches(FOCUSABLE)) list.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };

  walk(root);
  return list.filter(isFocusableVisible);
}

/** Deepest focused element: `activeElement` stops at each shadow host. */
function activeElement(): HTMLElement | null {
  let node: Element | null = document.activeElement;
  while (node?.shadowRoot?.activeElement) {
    node = node.shadowRoot.activeElement;
  }
  return node instanceof HTMLElement ? node : null;
}

/**
 * Every mounted trap, oldest first. Traps listen on the document (focus must
 * not escape between physically distant roots), so without a stack a hint
 * popover opened during a tour would fight the tour's tooltip: both handlers
 * run, both call preventDefault, and the last one registered silently wins.
 */
const traps: object[] = [];

/**
 * Keeps Tab / Shift+Tab cycling inside the container while it is mounted.
 * Only the most recently created trap steers focus; the ones below it stay
 * dormant until it is released.
 *
 * `getExtraRoot` may supply a second root whose focusable elements join the
 * cycle after the container's (used for steps where interacting with the
 * highlighted target is allowed — keyboard users can reach it via Tab).
 *
 * Returns a cleanup function.
 */
export function trapFocus(container: HTMLElement, getExtraRoot?: () => Element | null): () => void {
  const trap = {};
  traps.push(trap);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    if (traps[traps.length - 1] !== trap) return;

    const cycle = collectFocusables(container);
    const extra = getExtraRoot?.();
    if (extra && extra !== container && !container.contains(extra) && extra.isConnected) {
      cycle.push(...collectFocusables(extra));
    }

    if (cycle.length === 0) {
      e.preventDefault();
      container.focus();
      return;
    }

    const active = activeElement();
    const index = active ? cycle.indexOf(active) : -1;
    const target =
      index === -1
        ? e.shiftKey
          ? cycle[cycle.length - 1]
          : cycle[0]
        : cycle[(index + (e.shiftKey ? -1 : 1) + cycle.length) % cycle.length];

    e.preventDefault();
    target!.focus();
  };

  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    const index = traps.indexOf(trap);
    if (index !== -1) traps.splice(index, 1);
  };
}
