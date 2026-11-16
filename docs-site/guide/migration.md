# Migrating from intro.js

Two paths, from fastest to cleanest:

1. **Migration adapter** — swap the import and keep your intro.js-shaped
   code running today.
2. **Native API** — rename options and switch callbacks to events; the
   mapping is mechanical (tables below).

::: tip Licensing
intro.js is AGPL-licensed (or commercial). TourKit is MIT and independently
implemented — it contains no Intro.js source code and is not affiliated with
Intro.js.
:::

## Path 1: the migration adapter

```diff
- import introJs from "intro.js";
- import "intro.js/introjs.css";
+ import { introJs } from "tourkit/compat-introjs";
+ import "tourkit/styles.css";
```

The adapter maps intro.js option names, callbacks, `data-intro*` attributes
and 1-based step numbers onto TourKit. Matched behaviors include boundary
button hiding (`hidePrev`/`hideNext`), `goToStepNumber()` by explicit
`data-step`, completion reasons (`"done"` / `"end"` / `"skip"`), no
`oncomplete` when closing mid-tour, HTML content by default and restart
semantics of repeated `start()`.

Known gaps (use the native API instead): `onhighlight*` callbacks,
`helperLayer*` options, per-hint programmatic `addHint()`,
`hideHintDialog()`, cookie persistence (localStorage is used). The adapter
renders content as HTML (intro.js contract) — sanitize model data or pass
`tooltipRenderAsHtml: false`.

## Path 2: the native API

```js
// intro.js                                  // TourKit
introJs.tour().setOptions({                  createTour({
  nextLabel: "Next",                           labels: { next: "Next", back: "Back", done: "Done" },
  showProgress: true,                          progress: true,
  exitOnOverlayClick: false,                   overlay: { clickToExit: false, opacity: 0.7, padding: 12 },
  overlayOpacity: 0.7,
  helperElementPadding: 12,                    allowHTML: true, // only if your content really has HTML
  steps: [{
    element: "#save",                            steps: [{ target: "#save",
    intro: "The <b>Save</b> button",                       content: "The <b>Save</b> button",
    position: "bottom-left-aligned",                       placement: "bottom-start" }],
  }],                                        });
}).start();                                  await tour.start();
```

### Options

| intro.js                                              | TourKit                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `steps[].element` / `intro`                           | `steps[].target` / `content`                                                    |
| `position: "bottom-left-aligned"`                     | `placement: "bottom-start"` (`*-right-aligned` → `-end`, `floating` → `center`) |
| `nextLabel` / `prevLabel` / `doneLabel` / `skipLabel` | `labels.next` / `back` / `done` / `skip`                                        |
| `showProgress` / `showBullets` / `showStepNumbers`    | `progress` / `bullets` / `stepNumbers`                                          |
| `exitOnOverlayClick`                                  | `overlay.clickToExit`                                                           |
| `overlayOpacity`                                      | `overlay.opacity`                                                               |
| `helperElementPadding`                                | `overlay.padding`                                                               |
| `scrollToElement: false`                              | `scroll.block: "off"`                                                           |
| `keyboardNavigation`                                  | `keyboard`                                                                      |
| `disableInteraction`                                  | `disableInteraction` (same name)                                                |
| `dontShowAgain` (cookie)                              | `showOnce: { key, checkbox: true }` (localStorage)                              |
| `tooltipClass` / `buttonClass`                        | `classes.tooltip` / `classes.button`                                            |

### Callbacks → events

| intro.js                              | TourKit                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `onbeforechange(el)` + `return false` | `tour.on("beforeStepChange", (e) => e.cancel())`          |
| `onchange(el)`                        | `tour.on("stepChange", ({ index, step, target }) => ...)` |
| `onbeforeexit` + `return false`       | `tour.on("beforeExit", (e) => e.cancel())`                |
| `onexit`                              | `tour.on("exit", ...)`                                    |
| `oncomplete`                          | `tour.on("complete", ({ reason }) => ...)`                |
| `goToStep(n)` (1-based)               | `goTo(n - 1)` (0-based)                                   |

Handlers subscribe with `on()` (multiple subscribers, returns an
unsubscribe) and may be async.

### Behavioral differences worth knowing

- **HTML off by default**: intro.js renders step content as HTML; TourKit
  uses `textContent` unless `allowHTML: true` (XSS-safe default).
- **0-based indices** everywhere in the native API.
- `beforeStepChange` can cancel navigation in **both** directions (intro.js
  only blocks forward).
- Esc / backdrop click emit `exit` **without** `complete` — analytics see
  only real completions.
- `data-intro*` attributes become `data-tour*`; custom `.introjs-*` CSS
  becomes `--tk-*` variables and `.tk-*` BEM classes.
- Hints: `introJs.hint()` → [`createHints`](/guide/hints) from
  `tourkit/hints`.
