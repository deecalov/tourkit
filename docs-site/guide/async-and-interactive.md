# Async targets & interactive steps

## waitForTarget

Single-page apps mount UI lazily: routes resolve, widgets hydrate, panels
render after a fetch. A tour step whose target does not exist yet would
classically fail or misplace. In TourKit such a step **floats in the center**
while the DOM is watched, and the spotlight **flows to the target** the
moment it appears:

```ts
createTour({
  // Tour-level default; can be overridden (or disabled) per step.
  waitForTarget: { timeoutMs: 10000, onTimeout: "float" },
  steps: [
    { target: "#lazy-panel", content: "Appears when the data loads." },
    { target: "#instant", content: "Normal step.", waitForTarget: false },
    {
      target: "#optional",
      content: "Skipped if it never mounts.",
      waitForTarget: { timeoutMs: 3000, onTimeout: "skip" },
    },
  ],
});
```

How it works:

- The watcher is a `MutationObserver` scoped to the waiting phase only
  (`childList` + `subtree` + `style/class/hidden` attribute changes), so it
  catches both late mounts and "was hidden, now visible" transitions.
  Mutation bursts are coalesced to one geometry sync per frame. A `root`
  outside `document.body` (an open `ShadowRoot`) is observed directly:
  subtree observation stops at the shadow boundary in browsers.
- A connected element with a zero rect (`display: none`) counts as missing —
  the step floats until it actually renders.
- The engine's transition queue is never blocked: Esc, Next, Back and
  `exit()` all work while waiting.
- On timeout, `"float"` (default) simply stops watching; `"skip"` advances to
  the next step. On the **last** step "advancing" means finishing the tour:
  `complete` fires with `reason: "finished"` and `showOnce` is marked, exactly
  as if the user had pressed Done. Use `"float"` there if that is not what you
  want.

## Preparing the DOM: onBeforeShow

When the target only exists after your code acts — a dropdown to open, a tab
to switch, a view to route to — do it in the step's `onBeforeShow` hook:

```ts
{
  target: "#settings-menu .export",
  content: "Export lives in the settings menu.",
  onBeforeShow: async () => {
    await openSettingsMenu(); // may be async; return false to cancel the step
  },
  onShown: ({ target }) => track("tour-step", target?.id),
}
```

- The target is resolved again after the hook, so the element it mounted or
  revealed is scrolled to, spotlighted and reported to `onShown` and the
  `stepChange` event. The hook itself receives the context as it was before
  it ran (the target may still be `null` there).
- Returning `false` cancels the navigation; the current step stays. A hook
  that throws is logged and the step is shown anyway.
- If the target appears even later than the hook resolves, `waitForTarget`
  takes over as usual.

## advanceOn

Let the user drive: an interactive step advances when the target receives an
event.

```ts
{
  target: "#create-report",
  title: "Try it",
  content: "Click the button to create your first report.",
  advanceOn: true,               // default event: "click"
  // advanceOn: { event: "change" }  — any DOM event name works
}
```

- The listener is attached in the capture phase, so `stopPropagation()` in
  the app's own handlers cannot swallow the advance.
- It is one-shot per render — a double click queues a single transition.
- It follows the target through re-renders (the selector is re-resolved when
  frameworks replace the node) and pairs naturally with `waitForTarget`.
- Requires an interactive target: with `disableInteraction: true` or
  `modal: true` TourKit warns and skips the binding.

## Standalone highlight()

Spotlight an element without a tour — no tooltip, no focus management:

```ts
import { highlight } from "sitetourkit";

const spot = highlight("#export-button", {
  overlay: { padding: 10, radius: 12 },
  // exitOnEsc: true (default), overlay.clickToExit: true (default)
});

spot.move("#next-thing"); // flows to another target
spot.refresh(); // re-sync after a manual layout change
spot.destroy(); // or let Esc / a backdrop click dismiss it
```

The spotlight follows its target on scroll/resize just like a tour step and
uses the same theming (`theme`, `zIndex`, CSS variables).

## Programmatic completion

`tour.complete()` finishes the tour with `reason: "finished"` from any step —
useful when the user reaches the goal outside the tour flow (e.g. they
created the report themselves):

```ts
document.querySelector("#create-report")!.addEventListener("click", () => {
  void tour.complete(); // beforeExit guard → complete → exit; showOnce is marked
});
```
