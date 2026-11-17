# Changelog

## 0.7.2 — 2026-11-17

Fixes from a post-0.7 audit of the library. Every defect below was first
reproduced by a failing test.

### Fixed

- **`destroy()` racing a pending transition.** `start()` followed by an
  immediate `destroy()` — React StrictMode's effect → cleanup → effect, or a
  fast route change — used to mount the tour anyway, leaving an overlay nobody
  owned. A transition queued before `destroy()` is now dropped, and one in
  flight stops at its next await. Likewise, `destroy()` during the exit fade
  followed by a new `start()` no longer lets the old fade-out remove the new
  tour's DOM.
- **A destroyed tour can be started again.** `destroy()` also removed the
  tour's own listeners, so a restarted instance stopped marking `showOnce`,
  saving `persistProgress` and leaving the active-tour registry (every later
  tour then warned "another tour is already running"). Listeners registered
  with `on()`/`once()` are still removed by `destroy()`.
- **A target prepared by `onBeforeShow` is used.** The target is resolved again
  after the hook, so an element the hook mounted or revealed (a menu, a tab) is
  scrolled to and reported to `onShown`/`stepChange` instead of `null`. The hook
  itself still receives the context as it was before it ran.
- **Explicit `undefined` options no longer erase defaults.** Wrappers that
  forward unset props (`{ placement: props.placement }`) crashed the tour
  (`placement: undefined`) or hid buttons (`buttons: { next: undefined }`).
  `undefined` now means "not provided" for every option that has a default,
  including nested `labels`/`buttons`/`overlay`/`scroll`/`waitForTarget` keys
  and `highlight()`'s `overlay`/`scroll`; optional options (`theme`, `zIndex`,
  `showOnce`, ...) can still be cleared with it through `setOptions`.
- **`bindTriggers`: a group without visible steps starts nothing.** It used to
  fall back to a scan of the whole page without the group filter and tour
  unrelated markup. Now it logs a warning and leaves a running tour alone.
- **Arrow keys, Home and End inside interactive step content** (`renderStep`
  forms, selects, ARIA sliders, listboxes, tablists, ...) move the caret or
  the selection instead of switching steps.
- **Hint popovers:** closing by a click outside no longer pulls focus back to
  the marker (it stole focus from the field the user clicked into); Esc returns
  focus to the marker as before. The Esc that closes a popover no longer also
  ends a tour or a `highlight()` underneath, regardless of which registered
  first. With `allowHTML` the marker and popover get a plain-text accessible
  name instead of raw markup (parsed in an inert document).
- **Scrolling to targets:** a target scrolled out of a nested scroller
  (sidebar, list) is brought into view even when its rect lies inside the
  viewport; `overflow: hidden` widgets are still left alone. A larger
  `scroll-margin` the page declares (for a sticky header) is honoured in both
  the visibility check and the scroll, and an inline `scroll-margin-top` on
  the target survives the scroll.
- **`lockScroll` with `scrollbar-gutter: stable`** no longer shifts the layout
  by the scrollbar width: the reserved gutter is not compensated twice.
- **Shadow DOM parity for `waitForTarget`, keyboard guard and focus restore.**
  `MutationObserver` in `_startTargetWatch` now observes `options.root` when it
  is outside `document.body` (such as an open `ShadowRoot`), so asynchronously
  mounted shadow targets are detected immediately instead of timing out.
  Keyboard handling (`_bindKeyboard`) and `rememberFocus` now resolve the active
  element through open shadow roots (`activeElement()`), preventing `Escape` or
  arrow keys inside a shadow `<input>` from controlling/closing the tour and
  restoring focus to shadow triggers on exit.
- **No forced synchronous layout on hint scroll sync.** `Hints.positionPopover`
  no longer toggles `popover.style.visibility = "hidden"` before reading
  `offsetWidth`/`offsetHeight`, caches the RTL check once per `syncAll()`, and
  skips redundant `style.left`/`style.top`/`style.display` writes when rounded
  coordinates have not changed.

### Changed

- **Headless API:** `TourEngine.forceIdle()` now drops transitions that were
  queued before it, and the one in flight no longer touches the state after
  it. `skip()`, `complete()` and `exit()` resolve to `false` when interrupted
  that way.
- Bundle budgets raised for the fixes: core 11 → 11.5 KB brotli (actual
  11.28), `index.global.js` 11.5 → 12 KB (11.49).

### Tooling

- `npm run test:coverage` upper-cases the drive letter on Windows; a working
  directory spelled `e:\` made Vitest count every file twice and fail the
  thresholds at ~37 %.
- New browser specs: `tests/e2e/shadow.spec.ts` (jsdom reports shadow-tree
  mutations to an observer on `document.body`, browsers do not, so only a
  browser can verify the ShadowRoot watch) and `tests/e2e/scroll.spec.ts`
  (nested scrollers, sticky headers, `scrollbar-gutter`).

## 0.7.1 — 2026-11-16

The npm package is now distributed as **sitetourkit**. Install it with
`npm install sitetourkit` and use `sitetourkit` in imports, including optional
entries such as `sitetourkit/hints` and `sitetourkit/styles.css`.

- Updated installation examples, npm/CDN links and packed-consumer checks.
- Synchronized package and lockfile versions for the first npm publication.
- TourKit APIs, browser globals and the GitHub repository remain unchanged.

## 0.7.0 — 2026-07-25

This release improves integration with ASP.NET Core applications and SPAs
that render frequently and manage their own modals, toasts and effect layers.

### New

- **Body flags for the host** — `tk-tour-active`, `tk-highlight-active` and
  `tk-hints-open` are set on `<body>` while a tour, a standalone `highlight()`
  or a hint popover is on screen, so a page can move its own chrome out of the
  way with plain CSS (`body.tk-tour-active .toasts { z-index: 40 }`). They are
  reference-counted, so overlapping instances do not strip each other's flag.
  Opt out with `hostClasses: false`.
- **`dataAttribute`** — renames the whole declarative family
  (`createTour({ dataAttribute: "data-tk-step" })`, also honoured by
  `bindTriggers`, whose trigger becomes `[data-tk-step-trigger]`, and by
  `fromDataAttributes(root, { attribute })`). Pages that already use
  `data-tour` for their own anchors no longer have to rename their markup.
- **`start({ replace: true })`** — waits for any other running tour to tear
  down before mounting, replacing the `await previous.exit(true)` boilerplate
  every consumer was writing to switch tours from a menu.
- **`getPersistedProgress(key, storage?)`** — reports the step index saved by
  `persistProgress` without reading the storage format by hand, so "continue
  where you left off" can be offered before the tour is built.
- **`labels` for hints** — `createHints({ labels: ru })` mirrors tours; the new
  optional `Labels.hintDismiss` is translated in all 11 bundled locales, so the
  popover button is no longer an untranslated "Got it".
- **Scrolling on `open()`** — `hints.open(i, { scroll: true })` (or an
  instance-wide `createHints({ scroll })`) brings an off-screen marker into
  view first. Without it a programmatic open could place the popover entirely
  outside the viewport.
- **`highlight().move(target, { scroll: false })`** — re-point the spotlight at
  a re-rendered node without moving the viewport.

### Fixed

- **Esc that the host already handled is ignored** by the tour, `highlight()`
  and hint popovers (`event.defaultPrevented`). A dialog opened on top of an
  interactive step now closes on Esc without also ending the tour. Navigation
  keys are deliberately exempt: apps routinely `preventDefault()` arrows to
  stop the page from scrolling, and treating that as "handled" would break
  tour navigation.

### Changed

- **No hashed chunk in `dist`.** The ESM entries are self-contained, like the
  CJS and IIFE ones, so vendoring consumers can copy individual files whose
  names are stable across releases. `hints.js` (4.5 KB brotli) and
  `compat-introjs.js` (14.0 KB) actually got smaller; the cost is a few KB of
  duplicated internals when one page loads two entries.
- Bundle budgets raised for the new options: core 10.5 → 11 KB brotli (actual
  10.66), `index.global.js` 11 → 11.5 KB (10.87).

### Documentation

- New **Theming** guide: every `--tk-*` variable with its type and default, a
  copy-paste template, and an explicit warning that `--tk-overlay-color` is a
  colour string paired with `--tk-overlay-opacity`, not an RGB triplet. A unit
  test fails if the stylesheet and the table drift apart.
- New **Vendoring** section (which `dist` files to copy and what each carries)
  and a **layering recipe** for apps with their own modals: keep `--tk-z`
  below them, do not enable `modal: true`, and lower toasts via the body flag.
- `Highlight.refresh()` now documents what matters in an SPA — it re-resolves
  the selector, so a replaced node is picked up, and it never scrolls.

## 0.6.0 — 2026-07-25

Release of the v0.5 audit (`docs/tourkit-v0.6-audit.md`): ten defects fixed,
the remaining roadmap gaps closed, and the test suite taken from 211 to 299
unit tests (coverage 97.7% statements / 91.4% branches).

### Fixed

- **The tooltip can no longer leave the viewport.** A floating step taller
  than the screen used to get a negative `y`, putting its title and close
  button out of reach. The centered placement is now clamped on both axes, the
  tooltip has a `max-height` and its content area scrolls.
- **`bindTriggers` no longer leaks a tour.** The returned unbind function only
  detached the click delegate; the tour it had started kept its keyboard
  listeners, auto-updater and — while a target was missing — a
  `MutationObserver` on `document.body`. Unbinding now tears that tour down.
- **`requestAnimationFrame` is called through a guarded wrapper.** Observer
  callbacks could fire in environments without rAF (a non-visual jsdom, a
  document being torn down) and throw an uncaught `ReferenceError`.
- **Hints keep consistent state.** `destroy()` now clears the hint list (the
  `hints` getter used to report phantom entries afterwards), and `add()`
  generates an id that cannot collide with a hint shifted by an earlier
  `remove()` — the collision made dismiss persistence hide the wrong marker.
- **`injectStyles()` no longer ships a stale version banner.** The embedded
  stylesheet carried `v0.4.0`; the version is now stamped into
  `dist/styles.css` at build time only, so the committed CSS module cannot
  drift.
- **A throwing callback cannot strand the tour.** Event handlers,
  `onBeforeShow`, `onShown`, `renderStep` and its cleanup are isolated: a
  failure is reported through `console.error` instead of rejecting the
  transition promise and leaving the tour half-rendered.
- **`bindTriggers()` and `fromDataAttributes()` are SSR-safe**, matching
  `start()` and `highlight()`: they warn and return instead of dereferencing
  `document`.
- **Only the topmost focus trap steers Tab.** A hint popover opened during a
  tour used to fight the tooltip for focus, since both listened on the
  document.
- The exit fade (200 ms) matched the CSS transition (180 ms); a duplicate
  `data-tour-step` slot silently overwrote the earlier element; an awaited
  target appearing mid-step was not announced to screen readers.

### Changed

- `bindTriggers(root)` scans `[data-tour]` **inside `root`** instead of the
  whole document, and its unbind function also destroys the tour it started.
- `showOnce` stores `{"v":1,"t":<epoch ms>}` instead of `"1"`. Existing `"1"`
  markers are still honoured as permanent opt-outs.
- Starting a second tour while one is running logs a warning (the behaviour is
  unchanged — two overlays and two focus traps are almost always a bug).
- An unknown `data-tour-placement` or `data-hint-position` value is reported
  instead of silently falling back.
- Bundle budgets raised for the new features: core 10 → 10.5 KB brotli
  (actual 10.17), `compat-introjs` 13.5 → 15 KB (14.47).

### New

- **`root`** — shadow DOM support: string selectors, the `[data-tour]` and
  `[data-hint]` scanners and the focus trap all work inside a given
  `ShadowRoot` or subtree. `createHints` and `highlight` accept it too.
- **`lockScroll`** — freezes page scrolling for the tour or a single step,
  compensating for the scrollbar so the layout does not jump. The tour's own
  scrolling to targets keeps working.
- **`showOnce.ttlMs`** — "remind me in 30 days": the opt-out expires and the
  tour runs again.
- **`sanitize`** — a hook applied to HTML content when `allowHTML` is on
  (`sanitize: (html) => DOMPurify.sanitize(html)`), also available through the
  intro.js adapter, which enables HTML by default.
- **Headless API** — `TourEngine`, `EngineDelegate`, `resolveTarget`,
  `Emitter` and `isPlacement` are public: drive the state machine with your
  own UI.
- **Declarative parity** — `data-tour-advance-on`, `data-tour-wait`,
  `data-tour-highlight` and `data-tour-lock-scroll` join the scanner.
- **Global builds for every entry** — `TourKitHints` and `TourKitIntroJs` join
  `TourKit` and `TourKitLocales`, so a `<script>` page can use hints and the
  migration adapter.
- **Six more locales**: `it`, `ja`, `pl`, `ptBR`, `tr`, `zhCN`.

### Infrastructure

- 299 unit tests (34 files); thresholds raised to 95% statements / 88%
  branches / 92% functions. New suites cover the focus trap (including
  Shift+Tab, which had no coverage at all), `Home`/`End`, the
  `ResizeObserver` path, SSR entry points and the whole `introJs.hint()`
  facade.
- Test isolation: instances created through the shared helpers are destroyed
  after every test, and an uncaught error now fails the test that produced it.
- Pure-logic suites run in the `node` environment, and the worker pool is
  bounded — the run went from ~234 s to ~86 s and no longer flakes with
  "Timeout calling fetch".
- `npm publish --provenance` is explicit in the release workflow; `pack-smoke`
  verifies every global build and the stylesheet version banner.
- Community infrastructure: issue and PR templates, code of conduct,
  Dependabot, CodeQL.
- The demo is in English and covers the new modal + locked-scroll scenario.

## 0.5.0 — 2026-07-22

First release aimed at the public npm registry. Entries from this version on
are written in English.

### New

- **`waitForTarget`** — first-class support for asynchronously mounted
  targets (SPA views, lazy widgets). A step whose target is missing or still
  hidden floats in the center while the DOM is watched (scoped
  `MutationObserver`, coalesced to one resync per frame); once the target
  appears, the page scrolls to it and the spotlight flows from the center to
  the element. Configurable per tour and per step:
  `waitForTarget: { timeoutMs = 10000, onTimeout: "float" | "skip" } | false`.
  Exiting or changing the step stops the watcher; the transition queue is
  never blocked while waiting.
- **`advanceOn`** — interactive steps ("click here to continue"):
  `step.advanceOn: true | { event }` advances the tour when the target
  receives the event (default `click`, capture phase). The listener is
  one-shot per render, moves with a re-resolved/awaited target and is warned
  about (and skipped) when `disableInteraction`/`modal` blocks the target.
- **`highlight(target, options?)`** — standalone spotlight without a tour:
  dims the page, cuts a hole around the target, follows it on
  scroll/resize, dismisses on Esc (`exitOnEsc: false` to keep) and backdrop
  click (`overlay.clickToExit`). Returns `{ move, refresh, destroy,
  isActive }`. No tooltip, no focus management.
- **`tour.complete()`** — programmatic completion with
  `reason: "finished"` from any step: fires `beforeExit` (cancellable) →
  `complete` → `exit` and marks `showOnce` as seen.
- **`modal: true`** (opt-in) — the tooltip gets `aria-modal="true"` and every
  sibling of the tour root becomes `inert` while the tour runs (previous
  `inert` attributes are remembered and restored). This is the one deliberate
  exception, besides the temporary scroll-margin, to the "never mutate the
  host DOM" rule. Implies the target is not interactive: it leaves the Tab
  cycle, and `advanceOn` does not fire. Toggleable live via `setOptions`.
- **`hints.add(input)` / `hints.remove(indexOrId)`** — dynamic hints at
  runtime: `add` renders a marker immediately (respecting a persisted
  dismissal for the same id; auto-renders the instance when needed) and
  returns the new index; `remove` closes the hint's open popover, unmounts
  the marker and re-stamps `data-hint-index`.
- **`tourkit/inject-styles`** — new entry for CSP and shadow-DOM setups
  (closes the last unimplemented spec item, §7): `injectStyles({ nonce?,
  target? })` uses constructable stylesheets when available (bypasses
  style-src) with a `<style nonce>` fallback, is idempotent per target and
  returns a cleanup. Also exports the raw `css` string. The stylesheet is
  embedded at build time (`scripts/gen-css-module.mjs` →
  `src/styles/css.generated.ts`, verified in CI).

### Infrastructure

- Size budgets: `index` ≤ 10 KB brotli (actual 8.97 — now includes
  `highlight`), `compat-introjs` ≤ 13.5 KB (shared chunk grew with the
  renderer features), new `inject-styles` ≤ 4.5 KB.
- Demo: new scenarios — async target with `advanceOn`, standalone spotlight;
  e2e coverage for both (68 Playwright tests across three engines).

## 0.4.1 — 2026-07-22

Patch following the v0.4.0 audit.

### Fixed

- Repeated or rapid trigger clicks force the previous triggered tour to exit
  before starting another. A module-wide active reference prevents overlapping
  overlays and focus traps even when different trigger buttons are used.
- Fixed-position targets are reachable through the focus trap. Visibility uses
  `checkVisibility()`, with an `offsetParent` fallback that accounts for fixed elements.
- A target hidden after start is treated as missing, producing a centered step
  rather than a cutout at the origin. Zero-sized guards are skipped and hidden
  hint targets no longer leave a marker at (0, 0).
- Escape belongs to host editable controls when focus is outside the tour.
  Inside the tour, Escape preserves dialog exit behavior.
- Tour, hint and compatibility scanners skip `visibility: hidden` elements
  through the shared visibility helper, including hidden ancestors.
- The exported version is injected from `package.json` during builds and tests;
  unbundled development uses `"0.0.0-dev"`. A test detects version drift.

### Accessibility

- Windows High Contrast support uses a forced-colors media query: translucent
  dimming, a Highlight-colored spotlight ring, tooltip/popover borders,
  system-colored bullets/progress/hints with explicit borders, and a hidden
  tooltip arrow when its shadow cannot communicate the intended shape.

## 0.4.0 — 2026-07-13

### Breaking and behavioral changes

- Completion now runs `beforeExit` before `complete`: the order is
  `beforeExit` -> `complete` -> `exit`. Cancelling exit leaves the tour active,
  without completion analytics or a `showOnce` marker.
- `TourEvents` and `HintsEvents` are type aliases without an index signature.
  Misspelled or nonexistent event names now fail type checking.
- The Intro.js compatibility entry is explicitly a migration adapter:
  HTML is enabled by default there; boundary hiding matches `hidePrev` and
  `hideNext`; closing an intermediate step invokes skip/exit without complete;
  completion distinguishes `done`, `end` and final-step `skip`; repeated start
  replaces the previous tour; `goToStepNumber` finds explicit step numbers.
- Source maps are excluded from the npm tarball, reducing its historical size
  from about 255 KB to 76 KB. Separate import/require export conditions use
  `.d.ts`/`.d.cts`, resolving package-type validation failures.

### Added

- `buttons.hideBackOnFirst` and `buttons.hideNextOnLast` hide boundary controls.
- Active-tour `setOptions()` reapplies theme, z-index, classes, overlay,
  keyboard listeners and normalized steps, then renders the current step.
- Selector/function targets are resolved again when widgets replace DOM nodes.
- `disableInteraction` guards all cutouts, including `step.highlight`.
- Interactive target descendants participate in the tooltip's Tab cycle.
- Compatibility getters, cloning, opt-out, hint removal and hint callbacks.
- `dist/locales.global.js` exposes locale dictionaries as `TourKitLocales`.

### Fixed

- Updated configured steps take priority over previous declarative scans.
  An empty list scans again; a tour with no steps after update/refresh exits
  instead of leaving an empty shell.
- Storage reads use memory fallback after failed web-storage writes, clear
  stale fallback on successful writes, and isolate local/session/memory maps.
- Focus context updates when a target is replaced.
- Highlight-only steps also guard additional cutouts.
- Showing a dismissed hint restores interactivity and updates persistence.
  Dismissed IDs are merged when several pages share a storage key.
- `autoUpdate` documentation describes its limits: transform-only or
  unobserved layout changes require explicit `tour.refresh()`.

### Infrastructure and documentation

- CI covers lint, formatting, types, coverage, build, budgets, package validation,
  packed-consumer smoke tests and Playwright.
- Browser projects include Chromium, Firefox and WebKit; visual baselines use Chromium.
- Size checks account for the shared chunk used at this release checkpoint.
- Build-time CSS banners match the package version and light default theme.
- Package metadata, community files and provenance wording were added.
- The MVC guide documents the locale global, IIFE terminology and default
  z-index, which is already above typical Kendo layers.

## 0.3.3 — 2026-07-13

### Performance

- Geometry checks skip unchanged spotlight paths, tooltip styles/classes and
  interaction guards. Unrelated container scrolling no longer forces layout;
  window-scroll layouts fell from 239 to approximately 122 over 120 frames.
- Direction is read once per rendered step instead of every geometry update.
- `_sync` batches rectangle, tooltip-size and viewport reads before writes.
- Scroll/resize/ResizeObserver listeners are installed once per tour;
  step changes update observed targets. Public `autoUpdate` is preserved.
- Redundant refresh no longer interrupts spotlight movement toward the same geometry.

### Benchmark

- Added `bench/`, a Playwright/CDP stand for layout/style/script/task metrics,
  start/navigation timing, scrolling, nested tracking and memory.
- External comparison with Intro.js 8.3.2 recorded approximately half the core
  JavaScript size, one fifth of navigation script time, aligned nested-scroll
  tracking and DOM cleanup near baseline. See
  `docs/tourkit-vs-introjs-benchmark.md` and `docs/tourkit-v0.3.3-perf.md`.

## 0.3.2 — 2026-07-13

### Changed

- The dark theme adds a glowing teal spotlight ring and increases dimming to
  0.68. Variables `--tk-spotlight-ring`, `--tk-spotlight-ring-width`,
  `--tk-spotlight-glow` and `--tk-overlay-opacity` control the effect. The ring
  follows extra cutouts, passes clicks through and disappears on floating steps.
  The light-theme ring remains transparent.

## 0.3.1 — 2026-07-12

### Changed

- Light became the default theme; `theme: "dark"` selects graphite, and
  `theme: "auto"` follows the system. Light-theme muted text `#5d6673` and
  accent `#0f766e` meet the tested 4.5:1 contrast threshold on their backgrounds.

### Mobile layout

- Tooltip width and minimum width clamp inside the viewport with 8 px margins.
- The footer wraps rather than squeezing step controls and action buttons.
- Coarse-pointer controls use larger buttons, a 36 px close target, 22 px hint
  markers, approximately 38 px marker hit areas and extended breadcrumb hit areas.
- Added touch browser checks at 375 x 667 and 320 x 568.
- Demo pages use a wrapping sticky header, compact narrow-screen spacing,
  44 px action heights and `touch-action: manipulation`.
- Demo styling adopts teal accents, a blurred header, SVG card icons,
  stacking-context examples, coordinated themes and reduced-motion handling.

## 0.3.0 — 2026-07-12

### Added

- `renderStep` supplies live custom DOM with cleanup on step change or exit;
  content may be empty when a custom renderer is provided.
- `step.highlight` adds cutouts alongside the main target. Only the primary
  cutout flows between steps; all targets participate in geometry updates.
- `persistProgress` stores the index on step change and resumes it on start.
  Completion and explicit exit clear the key; navigation preserves it.
- `bindTriggers` delegates declarative group launch from `data-tour-trigger`.
- Optional locale sets: `ru`, `de`, `es`, `fr` and `ar`.
- `theme: "auto"` follows the system color scheme.

### Accessibility

- Hint popovers trap focus, focus the action, restore marker focus, and use
  `aria-haspopup`/`aria-controls` while open.
- Tooltips use `aria-labelledby` when titled and an announcement label
  otherwise. Progress has an accessible label; tested serious axe violations were zero.

### Quality and infrastructure

- Expanded end-to-end coverage to multiple cutouts, triggers, multi-page
  navigation, tooltip/popover accessibility and five visual snapshots.
- Added brotli size budgets for core, hints, adapter and locales.
- Added `prepublishOnly`, packaged changelog and the MVC integration guide.

## 0.2.0 — 2026-07-12

### Added

- `tourkit/hints`: pulsing markers, popovers, a Got it action, nine logical
  anchor positions, declarative attributes, open/dismiss events and stored dismissal.
- `showOnce`: completion marks a tour seen; an optional opt-out checkbox writes
  immediately. Escape does not mark completion. Storage supports local,
  session and custom adapters with memory fallback.
- `tourkit/compat-introjs`: legacy factories, option/placement/callback mapping,
  one-based navigation and declarative Intro.js attribute discovery.
- Logical start/end placement and hint anchors mirror in RTL contexts.
- Playwright coverage for complete tours, exits, keyboard, scrolling,
  stacking contexts, hint persistence, opt-out and compatibility tours.

### Changed

- Added hints and compatibility subpath exports in ESM, CJS and declarations.
- Added `labels.dontShowAgain` and the tooltip opt-out checkbox.
- Added hint and compatibility examples to the demo.

## 0.1.0 — 2026-07-12

Initial MVP based on `docs/mit-design.md`.

### Features

- Queued tour engine with cancellable step/exit guards and completion reasons.
- SVG spotlight with animated cutouts and no target z-index manipulation.
- Viewport flip/shift/arrow positioning, cutout anchoring, centered fallback,
  scroll/resize observation and automatic scrolling.
- Programmatic and declarative steps, ordered slots, groups and rescanning.
- Keyboard navigation, Tab trapping, focus restoration and live announcements.
- Plain-text content by default with `allowHTML: false`.
- Initial dark graphite theme, light alternative and CSS custom properties.
- Numbered active breadcrumbs and animated segmented progress.
- ESM/CJS/browser-global builds, declarations, SSR-safe imports and no runtime dependencies.

### Stabilization

- Removed SVG `viewBox` scaling that displaced cutouts near scrollbars; geometry
  uses layout-viewport pixels. See `docs/tourkit-v0.1.md`, section 7.1.
- Anchored tooltip placement to the inflated cutout instead of the target box.
- Applied overlay color/opacity overrides through CSS variables so stylesheet
  rules do not override SVG presentation attributes.
- Avoided recentering already-visible targets on every step.
