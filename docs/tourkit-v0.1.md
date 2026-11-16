# TourKit v0.1: MVP implementation report

> Historical implementation and validation record, 2026-07-12.
> Design: [mit-design.md](mit-design.md). Source paths are relative to the
> repository root. Later releases changed defaults and added features;
> use the README and current guide for present-day integration.

## 1. Delivered scope

The MVP included a queued tour state machine with cancellable guards, an SVG
spotlight with animated cutouts, a navigable tooltip with bullets/progress/step
numbers, a flip/shift/arrow placement solver, declarative steps, keyboard and
focus management, live announcements, scrolling, geometry updates, CSS theming
and reduced-motion support. ESM, CJS, IIFE/global builds and TypeScript
declarations were produced with SSR-safe imports.

Hints, persistence, custom step rendering, the Intro.js adapter and Playwright
end-to-end coverage were scheduled for later releases.

## 2. Source structure

| Area                    | Responsibility                                                |
| ----------------------- | ------------------------------------------------------------- |
| `src/index.ts`          | Public factory, declarative discovery and types               |
| `src/core/`             | Types, defaults, merging, label formatting, events and engine |
| `src/geometry/`         | Rectangles, interpolation, placement, updates and scrolling   |
| `src/ui/`               | DOM helpers, focus, overlay, tooltip and renderer delegate    |
| `src/tour/`             | Step normalization and public facade                          |
| `src/styles/styles.css` | BEM hooks, custom properties, themes and reduced motion       |
| `tests/`                | Vitest/jsdom unit and integration coverage                    |
| `demo/`                 | Vite demonstration application                                |

The build used tsup, with Vitest and V8 coverage for validation.

## 3. Core mechanisms

### Spotlight

A viewport-sized SVG path combines an outer rectangle and a rounded cutout
using even-odd fill. The unpainted hole naturally passes clicks to the target;
the painted backdrop handles optional exit. A requestAnimationFrame loop
interpolates rectangle and radius over `overlay.transitionMs` (300 ms).
Targetless steps collapse the cutout at the center. No target class or z-index
change is needed, including inside transformed stacking contexts.

### State machine

A promise queue serializes transitions, including rapid repeated Next clicks.
`beforeStepChange` can cancel both directions through `e.cancel()`, and a
step's `onBeforeShow` may return false. Done or advancing beyond the final step
completes with `finished`; the close button completes with `skipped`; Escape
and backdrop clicks emit exit without completion. Rendering is delegated
through `EngineDelegate`, allowing engine tests without a browser.

### Positioning

All geometry uses viewport coordinates and fixed layers. The solver tries the
requested side, then configured precedence, then center; shifts inside an 8 px
viewport margin; and clamps the arrow away from corners. Tooltip size is
measured synchronously before placement.

### Security and accessibility

Plain-text content is the default. Tests verified that an image `onerror`
payload remained inert. Tooltips use dialog semantics, labels/descriptions,
real buttons, valid progress attributes, active-step announcements, focus
trapping and restoration. Keyboard navigation avoids interfering with host
text input.

## 4. Historical validation

| Check                  | Result at the v0.1 checkpoint                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Strict TypeScript      | Passed                                                                                                       |
| Unit/integration suite | Passed across eight files at the initial checkpoint                                                          |
| Coverage               | Approximately 88% statements; engine and placement approximately 99%; step scanning 100%                     |
| Build                  | ESM approximately 19 KB, approximately 6.7 KB gzip; CJS, IIFE, declarations and CSS produced                 |
| Demo walkthrough       | Six steps, centered and anchored placement, transforms, scrolling, keyboard navigation and focus restoration |
| Declarative tour       | Reserved step slots and gap filling verified                                                                 |
| Backdrop/cutout        | Backdrop exited; cutout passed clicks through                                                                |

These are historical figures. Use current CI output for current counts and budgets.

## 5. Usage

```ts
import { createTour } from "tourkit";
import "tourkit/styles.css";

const tour = createTour({
  progress: true,
  labels: { next: "Next", back: "Back", done: "Done", skip: "Close" },
  steps: [
    { title: "Hello!", content: "A centered floating step." },
    { target: "#save", content: "The Save button.", placement: "bottom-start" },
  ],
});
tour.on("beforeStepChange", (e) => {
  if (!ready) e.cancel();
});
tour.on("complete", ({ reason }) => track("tour_done", reason));
await tour.start();
```

Declarative steps use `data-tour`, `data-tour-title` and `data-tour-step`.
Run development commands from the repository root: `npm run dev`, `npm test`,
`npm run test:coverage`, `npm run build`, and `npm run typecheck`.

## 6. Intentional differences from the proposal

1. Plain CSS replaced the proposed SCSS source; the stylesheet did not justify
   another preprocessing step.
2. Scrolling temporarily sets and restores `scroll-margin` on a target so the
   browser can apply padding. This is a limited host-style mutation.
3. Keyboard handling uses document bubbling so Escape still works after focus
   leaves a nonmodal tour. Host text input is respected.
4. tsup/esbuild replaced the proposed Vite library build configuration.

## 7. Stabilization fixes

### 7.1. Spotlight offset near scrollbars

The cutout drift grew toward viewport edges, reaching about 15 px horizontally
and 7 px vertically. The SVG used `viewBox` dimensions from `innerWidth` and
`innerHeight`, while the fixed element occupied the layout viewport excluding
the scrollbar. Default aspect-ratio fitting scaled and centered the SVG
coordinate grid. One measured cutout was at (198.7, 266.2) instead of (193, 262).

Removing `viewBox` made SVG units map directly to CSS pixels. `viewportRect()`
was switched to `documentElement.clientWidth/clientHeight`, and the document
element was observed for size changes. Subsequent measurements showed 0.00 px
error at both tested corners. Overlay regression coverage checks the missing
`viewBox`, direct coordinate mapping and outer viewport rectangle. All 64
unit tests passed at that checkpoint.

### 7.2. Tooltip arrow anchored inside the cutout border

The spotlight includes padding around the target, but the tooltip originally
anchored to the target rectangle. Its arrow therefore intruded into the
cutout. Both initial rendering and `_sync` were changed to anchor to the
inflated spotlight stage. Measured top and bottom gaps were 14 px, with a
4 px decorative arrow-tip gap.

### 7.3. Initial theme redesign

The initial dark graphite design used surface `#15171c`, a layered shadow,
14 px corners, teal accent `#2dd4bf`, hover `#5eead4`, and dark accent text
`#06231f`. Active breadcrumbs became 26 px numbered circles; inactive dots
were 10 px with extended hit areas. Progress became one segment per step,
with a subdued completed state, gradient current state and reduced-motion
handling. Checks passed on light and dark host pages, with 65 tests at this
checkpoint. The default theme later became light in v0.3.1.

### 7.4. Follow-up stabilization

- Overlay color and opacity moved from SVG presentation attributes to inline
  CSS variables because stylesheet rules overrode the attributes. Overrides
  apply only for nondefault options, preserving host theming; the default
  overlay color was aligned with CSS at `#05070a`.
- Scrolling now checks whether the target is already visible with configured
  padding before recentering.
- Package ignore rules, changelog and CDN metadata were added.
- Documentation recorded theme defaults and warned against mounting the fixed
  root under a transformed or filtered custom container.

## 8. Planned v0.2 work

Hints and popovers sharing the placement solver, `showOnce` with storage
adapters, custom step rendering, the migration adapter, Playwright and CI
bundle budgets were the next milestones. Later releases implemented these.

## 9. Migration

The public migration reference is [introjs-migration.md](introjs-migration.md).
The runtime compatibility adapter was still planned at the v0.1 checkpoint;
current releases provide `tourkit/compat-introjs`.
