# TourKit

[![CI](https://github.com/deecalov/tourkit/actions/workflows/ci.yml/badge.svg)](https://github.com/deecalov/tourkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tourkit)](https://www.npmjs.com/package/tourkit)
[![bundle size](https://img.shields.io/badge/core-10.7%20KB%20brotli-blue)](#)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Lightweight, dependency-free product tours and onboarding walkthroughs.
MIT-licensed, accessible, framework-agnostic.

- **SVG spotlight** instead of z-index hacks — works inside `transform`/`filter` stacking contexts, never mutates your DOM.
- **Async targets (SPA-ready)**: steps wait for lazily mounted elements and the spotlight flows to them when they appear (`waitForTarget`); no "element not found" failures.
- **Interactive steps**: `advanceOn` moves the tour forward when the user clicks the highlighted element; `highlight()` spotlights anything without a tour.
- **Viewport-based positioning** with flip / shift / arrow and graceful fallback to a centered dialog.
- **Accessible by default**: real `<button>`s, focus trap and restore, `aria-live` step announcements, full keyboard support, `prefers-reduced-motion`, Windows High Contrast (forced-colors), opt-in modal mode (`inert`) and scroll locking. Steps that allow interacting with the target include it in the Tab cycle — including targets inside open shadow roots.
- **XSS-safe by default**: step content is rendered as plain text unless you opt in with `allowHTML` (with an optional `sanitize` hook). CSP-friendly: external CSS or `injectStyles({ nonce })`.
- **Fits anywhere**: shadow DOM via `root`, `<script>` tags via per-entry global builds, and a DOM-free `TourEngine` for custom UIs.
- **Small**: core ~10.7 KB brotli + ~3.8 KB CSS (brotli), zero runtime dependencies, ESM / CJS / IIFE (global) builds, SSR-safe imports. Optional entries: hints, intro.js migration adapter, locales, style injector.

## Comparison

|                                          | TourKit                       | driver.js             | Shepherd.js       | intro.js                      |
| ---------------------------------------- | ----------------------------- | --------------------- | ----------------- | ----------------------------- |
| License                                  | **MIT**                       | MIT                   | AGPL / commercial | AGPL / commercial             |
| Core size (compressed)                   | ~10.7 KB                      | ~5 KB                 | ~25 KB            | ~29 KB                        |
| Waits for async targets                  | **Yes**                       | No                    | No                | No                            |
| Hints (beacons)                          | **Yes**                       | No                    | No                | Yes                           |
| Show-once / progress persistence         | **Yes**                       | No                    | No                | Cookie-based                  |
| Accessibility (axe serious violations)   | **0**                         | 4*                    | 2*                | 7*                            |
| Works in transform/filter contexts       | **Yes**                       | Yes                   | Partial           | No                            |
| Tracks targets in scrolled containers    | **Yes, 0 px error**\*\*       | No (static overlay)** | not benched       | No (drifts ~1200 px)**        |
| Layouts per frame while window-scrolling | **1**\*\*                     | 4\*\*                 | not benched       | 0 (page-coordinate drawing)** |
| Host DOM untouched                       | **Yes** (opt-in `inert` only) | No (classes)          | No                | No (classes/z-index)          |
| intro.js migration adapter               | **Yes**                       | —                     | —                 | —                             |

\* third-party audit data, 2026. \*\* measured on our public bench stand
(Playwright + CDP, all three libraries as black boxes through their public
APIs) — methodology and full numbers in
[`docs/tourkit-vs-introjs-benchmark.md`](docs/tourkit-vs-introjs-benchmark.md).

## Quick start

```bash
npm install tourkit
```

```ts
import { createTour } from "tourkit";
import "tourkit/styles.css"; // or: import { injectStyles } from "tourkit/inject-styles"

const tour = createTour({
  steps: [
    { title: "Welcome!", content: "A floating step without a target." },
    { target: "#save", title: "Saving", content: "Click here to save.", placement: "bottom-start" },
    { target: () => document.querySelector(".chart"), content: "Charts are built automatically." },
    // SPA: the panel may not exist yet — the step floats, then anchors when it mounts.
    { target: "#lazy-panel", content: "Click the panel to continue.", advanceOn: true },
  ],
});

tour.on("complete", ({ reason }) => console.log(reason)); // "finished" | "skipped"
await tour.start();
```

### Async targets and interactive steps (v0.5)

```ts
createTour({
  waitForTarget: { timeoutMs: 8000, onTimeout: "skip" }, // per-tour default; per-step override or `false`
  steps: [
    { target: "#mounted-later", content: "Appears when ready", advanceOn: { event: "click" } },
  ],
});

import { highlight } from "tourkit";
const spot = highlight("#export-button"); // standalone spotlight, no tooltip
spot.move("#next-thing");
spot.destroy(); // or Esc / backdrop click

tour.complete(); // programmatic completion: reason "finished", showOnce marked
```

Modal onboarding: `createTour({ modal: true, ... })` sets `aria-modal` and
makes everything outside the tour `inert` (restored on exit) — the one
deliberate opt-in exception to the "never mutate the host DOM" rule. The
highlighted target is not interactive in this mode.

### Declarative steps

```html
<button data-tour="Click to save" data-tour-title="Saving" data-tour-step="2">Save</button>
```

```ts
createTour().start(); // scans [data-tour] when no steps are configured
```

### Hints (v0.2)

```ts
import { createHints } from "tourkit/hints";

const hints = createHints({
  rememberDismissed: { key: "hints:main" }, // dismissed hints stay hidden
  hints: [{ target: "#export", content: "Export to Excel", markerPosition: "top-end" }],
}).render(); // or declaratively via [data-hint] attributes

hints.add({ target: "#new-feature", content: "Just shipped!", id: "nf" }); // dynamic (v0.5)
hints.remove("nf");
```

### Show once (v0.2)

```ts
createTour({ showOnce: { key: "tour:onboarding", checkbox: true }, steps }); // once per user
```

### Migration from intro.js

`tourkit/compat-introjs` is a **migration adapter**, not a 100% drop-in
replacement. It maps the intro.js option names, callbacks, `data-intro`
attributes and 1-based step numbers onto TourKit:

```ts
import { introJs } from "tourkit/compat-introjs";
introJs
  .tour()
  .setOptions({ steps: [{ element: "#a", intro: "Text" }] })
  .start();
```

Matched intro.js behaviors: boundary button hiding (`hidePrev`/`hideNext`),
`goToStepNumber()` by explicit `data-step` number, completion reasons
(`"done"` / `"end"` / `"skip"`), no `oncomplete` when closing mid-tour,
HTML step content by default, restart semantics of repeated `start()`,
`getOption` / `getSteps` / `getStep` / `clone` / `setDontShowAgain`.

Known gaps (use the native API instead): `onhighlight*` callbacks, floating
helper layer options (`helperLayer*`), per-hint programmatic `addHint()`,
`hideHintDialog()`, cookie-based persistence (localStorage is used). The
adapter renders step content as HTML (intro.js contract) — pass
`tooltipRenderAsHtml: false`, or a `sanitize` function, for untrusted data.

### Custom content, multi-spotlight, multi-page, MVC

```ts
createTour({
  persistProgress: { key: "tour:orders" }, // resumes across page loads
  steps: [
    { target: "#a", content: "", renderStep: (ctx, host) => host.append(buildForm()) },
    { target: "#b", content: "Both cards", highlight: ["#c", "#d"] }, // extra cutouts
  ],
});

import { de } from "tourkit/locales"; // ar, de, es, fr, it, ja, pl, ptBR, ru, tr, zhCN
import { bindTriggers } from "tourkit";
bindTriggers(document, { labels: de }); // [data-tour-trigger] buttons just work
```

### Shadow DOM, script tags and headless (v0.6)

```ts
// Web components: string selectors are resolved inside the given root.
createTour({ root: document.querySelector("my-widget")!.shadowRoot!, steps });

// Modal onboarding with the page frozen behind it.
createTour({ modal: true, lockScroll: true, steps });

// Untrusted HTML content.
createTour({ allowHTML: true, sanitize: (html) => DOMPurify.sanitize(html), steps });

// Your own UI on top of the DOM-free engine.
import { TourEngine, type EngineDelegate } from "tourkit";
new TourEngine(myDelegate).start(steps);
```

Script-tag builds, one global per entry: `dist/index.global.js` (`TourKit`),
`dist/hints.global.js` (`TourKitHints`), `dist/compat-introjs.global.js`
(`TourKitIntroJs`), `dist/locales.global.js` (`TourKitLocales`).

### Host integration (v0.7)

An app with its own chrome — toasts, dialogs, hotkeys — needs to know when a
tour is running, and it needs the tour not to steal keys the app has already
handled.

```css
/* While a tour runs, drop your notification stack below its tooltip. */
body.tk-tour-active .my-toasts {
  z-index: 40;
}
body.tk-highlight-active .my-hint-markers {
  visibility: hidden;
}
body.tk-hints-open .my-sidebar {
  pointer-events: none;
}
```

`tk-tour-active`, `tk-highlight-active` and `tk-hints-open` are set on `<body>`
for as long as a tour, a standalone `highlight()` or a hint popover is
mounted. They are reference-counted, so overlapping instances do not strip
each other's flag. Opt out with `hostClasses: false`.

`Esc` that your page already handled (`event.defaultPrevented`) is ignored by
the tour, `highlight()` and hints — a dialog opened on top of an interactive
step closes without ending the tour. Navigation keys are exempt: apps often
`preventDefault()` arrows to stop the page from scrolling.

Switching tours from a menu needs no teardown boilerplate:

```ts
await nextTour.start({ replace: true }); // waits for any running tour to exit
```

**Layering with your own dialogs.** The tour stays deliberately below host
modals when a step is interactive (`advanceOn`): the dialog the user is asked
to open must render on top of the spotlight. Set `--tk-z` (or `zIndex`) under
your modal layer and do **not** enable `modal: true` — its `inert` treatment
would block your own dialog. A layout that works in production:
`fx/confetti 4000 > toasts 90 > app modals 60 > tour 50 > toasts while touring 40`.

**Markup collisions.** `data-tour` is a generic name; if your page already uses
it, a `createTour()` without `steps` would scan _your_ attributes and build a
tour out of them. Rename the whole family in one option:

```ts
createTour({ dataAttribute: "data-tk-step", steps: [] }); // scans data-tk-step*
bindTriggers(document, { dataAttribute: "data-tk-step" }); // [data-tk-step-trigger]
```

### Vendoring without a bundler

Every entry is self-contained — no shared `chunk-*.js`, no hashed filenames —
so `dist` can be copied into `wwwroot/vendor/tourkit/` and referenced
directly. Copy what you use:

| File                        | Needed for                                                   |
| --------------------------- | ------------------------------------------------------------ |
| `styles.css`                | always (or call `injectStyles()` instead)                    |
| `index.global.js`           | tours, `highlight()`, `bindTriggers` (`window.TourKit`)      |
| `hints.global.js`           | hints (`window.TourKitHints`)                                |
| `locales.global.js`         | bundled label sets (`window.TourKitLocales`)                 |
| `compat-introjs.global.js`  | the intro.js migration adapter (`window.TourKitIntroJs`)     |
| `index.js`, `hints.js`, ... | the same entries as ES modules, for `<script type="module">` |

Loading two entries on one page duplicates a few KB of shared internals; that
is the deliberate trade for stable, individually copyable filenames.

## API surface

`createTour(options)` returns a `Tour`:

| Member                                                       | Description                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `start(opts?)` / `exit(force?)` / `complete()` / `destroy()` | lifecycle; `start({ replace: true })` ends other running tours first, `complete()` finishes with `reason: "finished"` |
| `next()` / `back()` / `goTo(i)`                              | navigation (0-based)                                                                                                  |
| `refresh(rescanSteps?)`                                      | re-sync geometry / re-read steps                                                                                      |
| `index`, `steps`, `isActive`                                 | state                                                                                                                 |
| `setOptions(patch)`                                          | update options; an active tour re-renders the current step live                                                       |
| `on(event, cb)` / `once(event, cb)`                          | `start`, `beforeStepChange`, `stepChange`, `beforeExit`, `exit`, `complete` — cancellable via `e.cancel()`            |

Event order on finishing or skipping: `beforeExit` (cancellable guard) →
`complete` → `exit`. A cancelled `beforeExit` keeps the tour active and no
`complete` is reported.

Buttons: `buttons.doneOnLast` turns Next into Done on the last step;
`buttons.hideBackOnFirst` / `buttons.hideNextOnLast` hide the boundary
buttons instead of rendering them disabled.

Keyboard: `Esc` exit (ignored when the host already handled that `Esc`),
`←`/`→` navigate, `Home`/`End` jump, `Tab` cycles inside the dialog (plus the
highlighted target when interaction is allowed).

Multi-page tours: `getPersistedProgress(key, storage?)` reports the saved step
index without touching the storage format, so a host can offer "continue where
you left off" before building the tour.

Auto-update tracks scrolling in any container, window/element resizes and
document layout shifts. Pure CSS `transform` changes or sibling reordering
that leave every observed size untouched are not detectable — call
`tour.refresh()` after such mutations.

Theming: the default look is light (matches light host pages); a dark graphite variant is available via `theme: "dark"`, and `theme: "auto"` follows `prefers-color-scheme`. Customize with CSS custom properties on `.tk-root` (`--tk-accent`, `--tk-surface`, ...). The active breadcrumb is a large circle showing the step number. Mobile-ready: the tooltip clamps to the viewport, controls grow on coarse pointers.

## Development

Use Node.js 22.13 or newer; CI uses Node.js 22 LTS. The library package,
configuration and commands live at the repository root.

```bash
npm ci
npm run dev             # demo with live reload
npm test                # unit tests
npm run build           # ESM / CJS / global builds, declarations and CSS
npm run site:build      # landing, demo and documentation in site/
```

Install Playwright browsers before running browser tests:

```bash
npx playwright install chromium firefox webkit
npm run test:e2e
```

On Linux, use `npx playwright install --with-deps chromium firefox webkit`.
Visual baselines are platform-specific; see
[Contributing](CONTRIBUTING.md) and the [release checklist](docs/tourkit-release-checklist.md).

| Path                | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `src/`              | Library implementation and styles                                   |
| `tests/`            | Unit, integration and Playwright tests                              |
| `demo/`, `landing/` | Demo playground and landing page                                    |
| `docs-site/`        | User guide and generated API documentation configuration            |
| `docs/`             | Design, integration, migration, benchmark and release documentation |
| `bench/`            | Reproducible comparison stand and recorded results                  |
| `.github/`          | CI, releases, Pages, dependency updates and issue templates         |

## License

MIT
