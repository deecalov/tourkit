# Migrating tours from Intro.js to TourKit

> A practical migration guide for Intro.js v7/v8 users. TourKit's native API
> uses different option names, zero-based indexes, and plain-text content by
> default. See `docs-site/guide/migration.md` for the current quick-start guide.

## 0. Migration checklist

- [ ] For an incremental migration, start with `sitetourkit/compat-introjs`.
- [ ] Replace the library and stylesheet imports.
- [ ] Replace `introJs.tour().setOptions()` with `createTour()` when using the native API.
- [ ] Map `element` to `target`, `intro` to `content`, and `position` to `placement`.
- [ ] Convert one-based `goToStep(n)` to zero-based `goTo(n - 1)`.
- [ ] Replace callbacks with events and `return false` with `e.cancel()`.
- [ ] Replace declarative `data-intro*` attributes with `data-tour*`.
- [ ] Enable `allowHTML` only for content that needs markup; sanitize untrusted HTML.
- [ ] Replace cookie-based opt-out with `showOnce`.
- [ ] Replace hints with `createHints` from `sitetourkit/hints`.
- [ ] Port `.introjs-*` styles to `--tk-*` variables and `.tk-*` hooks.

## 1. Imports

```diff
- import introJs from "intro.js";
- import "intro.js/introjs.css";
+ import { createTour } from "sitetourkit";
+ import "sitetourkit/styles.css";
```

Without a bundler, load `dist/index.global.js`, which exposes
`TourKit.createTour`. Optional locale dictionaries use `dist/locales.global.js`
and `TourKitLocales`. These are IIFE/global builds.

## 2. Create and start a tour

Before:

```js
const intro = introJs.tour();
intro.setOptions({
  nextLabel: "Next",
  prevLabel: "Back",
  doneLabel: "Done",
  showProgress: true,
  exitOnOverlayClick: false,
  overlayOpacity: 0.7,
  helperElementPadding: 12,
  steps: [
    { title: "Hello", intro: "Welcome!" },
    {
      element: "#save",
      title: "Saving",
      intro: "The <b>Save</b> button",
      position: "bottom-left-aligned",
    },
    { element: document.querySelector(".chart"), intro: "Chart", position: "top-middle-aligned" },
  ],
});
intro.start();
```

After:

```js
const tour = createTour({
  labels: { next: "Next", back: "Back", done: "Done", skip: "Close" },
  progress: true,
  overlay: { clickToExit: false, opacity: 0.7, padding: 12 },
  allowHTML: true, // This example includes trusted markup.
  steps: [
    { title: "Hello", content: "Welcome!" },
    {
      target: "#save",
      title: "Saving",
      content: "The <b>Save</b> button",
      placement: "bottom-start",
    },
    { target: document.querySelector(".chart"), content: "Chart", placement: "top" },
  ],
});
await tour.start();
```

## 3. Option mapping

| Intro.js                                         | TourKit                                             | Notes                                                           |
| ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| `steps[].element`                                | `steps[].target`                                    | Selector, Element, or function target                           |
| `steps[].intro`                                  | `steps[].content`                                   | Required unless a custom renderer supplies the content          |
| `steps[].title`                                  | `steps[].title`                                     | Same purpose                                                    |
| `steps[].position`                               | `steps[].placement`                                 | See section 4                                                   |
| `steps[].tooltipClass`                           | `steps[].classes.tooltip`                           |                                                                 |
| `steps[].highlightClass`                         | Overlay styling hooks                               | The spotlight is a cutout, not a raised target element          |
| `steps[].disableInteraction`                     | `steps[].disableInteraction`                        |                                                                 |
| `steps[].scrollTo`                               | `steps[].scroll.block`                              | Use `"off"` to disable scrolling                                |
| `tooltipPosition`                                | `placement`                                         | Tour-wide default                                               |
| `positionPrecedence`                             | `placementPrecedence`                               | The four sides                                                  |
| `autoPosition: false`                            | No direct equivalent                                | Preferred placement is kept while it fits; flip remains enabled |
| `nextLabel`, `prevLabel`, `doneLabel`            | `labels.next`, `labels.back`, `labels.done`         |                                                                 |
| `skipLabel`                                      | `labels.skip`                                       | Accessible label for the close button                           |
| `stepNumbersOfLabel`                             | `labels.stepOf`                                     | Full template, for example `"{step} of {total}"`                |
| `hidePrev`, `hideNext`                           | `buttons.hideBackOnFirst`, `buttons.hideNextOnLast` | Boundary hiding; `buttons.back/next: false` hides globally      |
| `nextToDone`                                     | `buttons.doneOnLast`                                |                                                                 |
| `showButtons`                                    | `buttons.next/back/skip`                            | Configure individual buttons                                    |
| `showBullets`, `showProgress`, `showStepNumbers` | `bullets`, `progress`, `stepNumbers`                |                                                                 |
| `progressBarAdditionalClass`                     | CSS on `.tk-tooltip__progress-seg`                  | Segment modifiers are `--done` and `--current`                  |
| `keyboardNavigation`, `exitOnEsc`                | `keyboard`, `exitOnEsc`                             |                                                                 |
| `exitOnOverlayClick`, `overlayOpacity`           | `overlay.clickToExit`, `overlay.opacity`            |                                                                 |
| `helperElementPadding`                           | `overlay.padding`                                   | Tooltip anchors to the cutout bounds                            |
| `scrollToElement: false`                         | `scroll.block: "off"`                               |                                                                 |
| `scrollTo: "tooltip"`                            | No direct equivalent                                | TourKit scrolls the target with `"center"` or `"nearest"`       |
| `scrollPadding`                                  | `scroll.padding`                                    |                                                                 |
| `tooltipRenderAsHtml`                            | `allowHTML`                                         | Intro.js defaults to HTML; native TourKit defaults to text      |
| `language` and dictionaries                      | `labels`                                            | Supply a label set                                              |
| `group`                                          | `fromDataAttributes(root, { group })`               |                                                                 |
| `isActive: false`                                | Do not call `start()`                               |                                                                 |
| `dontShowAgain*`                                 | `showOnce: { key, storage?, checkbox? }`            | Uses storage instead of cookies                                 |

## 4. Placement mapping

| Intro.js position                 | TourKit placement |
| --------------------------------- | ----------------- |
| `bottom`, `bottom-middle-aligned` | `bottom`          |
| `bottom-left-aligned`             | `bottom-start`    |
| `bottom-right-aligned`            | `bottom-end`      |
| `top`, `top-middle-aligned`       | `top`             |
| `top-left-aligned`                | `top-start`       |
| `top-right-aligned`               | `top-end`         |
| `left`, `right`                   | `left`, `right`   |
| `floating`                        | `center`          |

## 5. Declarative attributes

| Intro.js                                                       | TourKit                              |
| -------------------------------------------------------------- | ------------------------------------ |
| `data-intro="Text"`                                            | `data-tour="Text"`                   |
| `data-title`                                                   | `data-tour-title`                    |
| `data-step`                                                    | `data-tour-step`                     |
| `data-position="bottom-left-aligned"`                          | `data-tour-placement="bottom-start"` |
| `data-intro-group`                                             | `data-tour-group`                    |
| `data-disable-interaction`                                     | `data-tour-no-interaction`           |
| `data-tooltip-class`, `data-highlight-class`, `data-scroll-to` | Configure programmatically           |

Explicit step numbers reserve slots; unnumbered elements fill gaps in document
order. Hidden elements are skipped. Programmatic steps take precedence.

```diff
- <button data-intro="Click to save" data-step="2" data-position="bottom-right-aligned">
+ <button data-tour="Click to save" data-tour-step="2" data-tour-placement="bottom-end">
```

`createTour().start()` scans declarative steps when none are configured. For a
group, pass `steps: fromDataAttributes(document, { group: "billing" })`.

## 6. Callbacks, events and HTML safety

| Intro.js                              | TourKit                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| `onstart(fn)`                         | `on("start", fn)`                                        |
| `onbeforechange(fn)`                  | `on("beforeStepChange", fn)`; call `e.cancel()` to block |
| `onchange(fn)`                        | No exact pre-highlight event; use `beforeStepChange`     |
| `onafterchange(fn)`                   | `on("stepChange", ({ index, step, target }) => ...)`     |
| `oncomplete(fn)` with `done` or `end` | `on("complete", ...)` with `reason: "finished"`          |
| `onskip` or completion reason `skip`  | `on("complete", ...)` with `reason: "skipped"`           |
| `onbeforeexit(fn)`                    | `on("beforeExit", e => e.cancel())`                      |
| `onexit(fn)`                          | `on("exit", fn)`                                         |

Native guards can block both directions. Check `e.direction === "forward"` if
only forward navigation should be blocked. Handlers may be asynchronous;
`on()` supports multiple subscribers and returns an unsubscribe function.
Escape and backdrop clicks produce `exit` without `complete`. Callback `this`
is not rebound: close over the tour instance. Per-step hooks are
`onBeforeShow` and `onShown`.

Native TourKit renders plain text. For markup, set `allowHTML: true`; for
untrusted markup, also provide a sanitizer:

```js
import DOMPurify from "dompurify";
createTour({ allowHTML: true, sanitize: (html) => DOMPurify.sanitize(html), steps });
```

The compatibility adapter enables HTML by default to match Intro.js. It also
accepts `sanitize`; use `tooltipRenderAsHtml: false` when HTML is unnecessary.

## 7. Instance methods, opt-out and hints

| Intro.js                            | TourKit                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| `start()`                           | `start()`; asynchronous, returns false when no tour is shown         |
| `exit(force)`                       | `exit(force)`                                                        |
| `nextStep()`, `previousStep()`      | `next()`, `back()`                                                   |
| `goToStep(n)`                       | `goTo(n - 1)`                                                        |
| `goToStepNumber(n)`                 | Find the corresponding zero-based index in `tour.steps`              |
| `addStep`, `addSteps`, `setSteps`   | `setOptions({ steps })`                                              |
| `refresh(refreshSteps)`             | `refresh(rescanSteps)`                                               |
| `setOption`, `setOptions`           | `setOptions(patch)`                                                  |
| `getCurrentStep()`, `currentStep()` | `index`; undefined outside an active tour                            |
| `isActive()`, `hasStarted()`        | `isActive`                                                           |
| `clone()`                           | `createTour(sameOptions)`                                            |
| `setDontShowAgain()`                | `showOnce` and its checkbox                                          |
| `introJs.hint.*`                    | `createHints` from `sitetourkit/hints`, or the compatibility adapter |

```js
createTour({
  showOnce: { key: "tour-onboarding-done", checkbox: true },
  labels: { dontShowAgain: "Don't show this again" },
  steps,
});
```

Completion stores the seen marker; Escape does not.

```js
import { createHints } from "sitetourkit/hints";
createHints({
  rememberDismissed: { key: "hints:page" },
  hints: [{ target: "#export", content: "Export to Excel", markerPosition: "top-end" }],
}).render();
```

Hint positions map `top-middle` to `top-center` and `middle-right` to
`middle-end`. Declarative hints use `data-hint*` attributes.

For incremental migration:

```js
import { introJs } from "sitetourkit/compat-introjs";
introJs.tour().setOptions({ steps }).oncomplete(fn).start();
```

This is a migration adapter with documented gaps, not complete API parity.

## 8. CSS and themes

| Intro.js                                            | TourKit                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Main CSS and separate themes                        | One `styles.css`; light default, `theme: "dark"` or `"auto"` |
| `.introjs-tooltip`                                  | `.tk-tooltip` and `--tk-*` custom properties                 |
| `.introjs-button`                                   | `.tk-button`, `--primary`, `--ghost`                         |
| `.introjs-overlay` opacity                          | `overlay.opacity` or `--tk-overlay-opacity`                  |
| Helper-layer border                                 | SVG spotlight styling hooks, including `.tk-overlay__ring`   |
| `.introjs-showElement` and target z-index overrides | Remove these workarounds; targets stay in place              |
| Separate RTL stylesheet                             | Logical CSS properties and RTL-aware placement               |

```css
.tk-root {
  --tk-accent: #b45309;
  --tk-radius: 10px;
  --tk-tooltip-max-width: 420px;
}
```

## 9. Complete native migration example

```js
const tour = createTour({
  progress: true,
  overlay: { clickToExit: false },
  allowHTML: true,
  steps: [
    { title: "Welcome", content: "A quick account tour." },
    { target: "#billing", content: "Billing settings.", placement: "right" },
    {
      target: "#export",
      content: "Export to <b>Excel</b>.",
      placement: "bottom-end",
      disableInteraction: true,
      onBeforeShow: () => ensureExportVisible(),
    },
  ],
});
tour.on("complete", () => track("tour_done"));
tour.on("exit", () => track("tour_closed"));
await tour.start();
```

### 9a. Multi-page tours

```js
const tour = createTour({
  persistProgress: { key: "tour:orders" },
  steps: [/* the same definition on every page of the route */],
});
await tour.start(); // Resumes the saved index after navigation.
```

Completion and explicit exit clear the key; leaving the page preserves it.
Use `bindTriggers()` for server-rendered launch buttons; see
[ASP.NET Core MVC integration](aspnet-mvc-integration.md).

## 10. Validate the migration

1. Walk through every step and check placement, especially former aligned positions.
2. Check HTML content and sanitization.
3. Check backward navigation and guard cancellation semantics.
4. Update analytics for `finished` and `skipped`; Escape no longer means completion.
5. Remove old CSS and target stacking-context workarounds.
6. Exercise dynamic targets, nested scrolling and transformed containers.
7. When migration is complete, remove the Intro.js dependency from the application.
