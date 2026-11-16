import type { TourOptionsInput } from "../core/types";
import { fromDataAttributes, resolveDataAttribute } from "./steps";
import { createTour, type Tour } from "./tour";

/**
 * The single tour driven by triggers, shared across `bindTriggers` roots:
 * a repeated click (or a click on another trigger) restarts instead of
 * stacking a second overlay and focus trap on top of the active tour.
 */
let activeTriggerTour: Tour | null = null;

const noop = (): void => {};

/**
 * Declarative tour launcher for server-rendered pages (e.g. ASP.NET MVC):
 * any element with `data-tour-trigger` starts a tour on click without a single
 * line of application JS beyond `bindTriggers()`. A non-empty attribute value
 * filters scanned steps by `data-tour-group`.
 *
 * Steps are scanned inside `root`, so a binding scoped to a widget only tours
 * that widget. Uses event delegation, so triggers added to the DOM later
 * (partial views, AJAX) keep working.
 *
 * `options.dataAttribute` renames the whole family, trigger included:
 * `data-tk-step` markup is launched by `[data-tk-step-trigger]`.
 *
 * Returns an unbind function. Unbinding also destroys the tour this binding
 * started (instant teardown, no events) — a route change must not leave an
 * overlay, a focus trap and a DOM watcher behind.
 */
export function bindTriggers(root?: ParentNode, options: TourOptionsInput = {}): () => void {
  if (typeof document === "undefined") {
    console.warn("[tourkit] bindTriggers() is a no-op outside the browser.");
    return noop;
  }

  const scope = root ?? document;
  const attribute = resolveDataAttribute(options.dataAttribute);
  const triggerAttr = `${attribute}-trigger`;
  /** The last tour started by this binding; only it may be torn down here. */
  let ownTour: Tour | null = null;

  const onClick = (event: Event) => {
    const trigger = (event.target as Element | null)?.closest?.(`[${triggerAttr}]`);
    if (!trigger) return;

    event.preventDefault();
    const group = trigger.getAttribute(triggerAttr) || undefined;

    const steps = options.steps?.length
      ? options.steps
      : fromDataAttributes(scope, { group, attribute });

    const previous = activeTriggerTour;
    const tour = createTour({ ...options, steps });
    activeTriggerTour = tour;
    ownTour = tour;

    void (async () => {
      // Force-exit the previous tour first so the two roots never coexist.
      if (previous) await previous.exit(true);
      // A faster follow-up click may have superseded this tour meanwhile.
      if (activeTriggerTour === tour) await tour.start();
    })();
  };

  scope.addEventListener("click", onClick);

  return () => {
    scope.removeEventListener("click", onClick);
    if (!ownTour) return;
    ownTour.destroy();
    if (activeTriggerTour === ownTour) activeTriggerTour = null;
    ownTour = null;
  };
}
