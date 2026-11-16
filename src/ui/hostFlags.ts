/**
 * Marker classes on `<body>` that let the host page react to a running tour
 * with plain CSS — no events to subscribe to, no state to mirror:
 *
 * ```css
 * body.tk-tour-active .my-toasts { z-index: 40; }
 * ```
 *
 * Hosts routinely need this: notification stacks, sticky headers and their
 * own hint layers sit above the tour and hide its buttons. Setting a class is
 * the only host-DOM mutation done outside `modal`/`lockScroll`, and it is
 * inert — nothing changes until the page styles the class itself. Opt out
 * with `hostClasses: false`.
 *
 * Reference-counted: two tours (or a tour plus a standalone spotlight) may
 * overlap, and the one that ends first must not strip the flag from the one
 * still on screen.
 */
const counts = new Map<string, number>();

export const TOUR_ACTIVE_CLASS = "tk-tour-active";
export const HIGHLIGHT_ACTIVE_CLASS = "tk-highlight-active";
export const HINTS_OPEN_CLASS = "tk-hints-open";

/** Adds the class (first holder wins); the returned function releases it. */
export function acquireHostClass(name: string): () => void {
  if (typeof document === "undefined") return () => {};

  const next = (counts.get(name) ?? 0) + 1;
  counts.set(name, next);
  if (next === 1) document.body.classList.add(name);

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const left = (counts.get(name) ?? 1) - 1;
    if (left > 0) {
      counts.set(name, left);
      return;
    }
    counts.delete(name);
    document.body.classList.remove(name);
  };
}
