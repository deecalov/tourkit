# TourKit v0.3.3: hot-path performance improvements

> Historical implementation and measurement report, 2026-07-13.
> Methodology and comparison stand:
> [TourKit vs Intro.js benchmark](tourkit-vs-introjs-benchmark.md).

The hot path is `autoUpdate` → `TourRenderer._sync()` on scroll, resize and
layout changes. Before v0.3.3 every call rebuilt the spotlight path, positioned
the tooltip using `getComputedStyle`, and rewrote interaction-guard styles,
interleaving layout reads and writes.

## Changes

### B1. Skip unchanged geometry in every `_sync` layer

- `SpotlightOverlay.refresh()` compares the stage, radius, extra cutouts and
  viewport with the last painted geometry. Unchanged geometry skips path
  construction. A redundant refresh no longer interrupts an animation heading
  toward the same destination.
- `TooltipView.position()` skips side classes, coordinates and arrow writes
  when placement is unchanged. `render()` invalidates the cache because it
  rewrites `className`.
- `_updateGuard` caches the last applied geometry.
- Regression coverage lives in `tests/overlay.test.ts` and `tests/tooltip.test.ts`.

### B2. Cache direction per step

Reading `getComputedStyle(el).direction` caused a style recalculation on every
sync. `render()` now reads direction once into `TooltipView._rtl`, and
`position()` reuses it. A direction change during a step takes effect on the
next render; this was an intentional tradeoff.

### B3. Batch reads before writes

Within a frame, read `stageRect`, extra stages, tooltip size and viewport
before writing the overlay, tooltip placement or guards. Previously,
`offsetWidth` was read after the path had changed, forcing another layout.

### B4. One listener set for the tour

`createAutoUpdater(callback)` installs capture-scroll, resize and
`ResizeObserver` listeners during `mount()`. Step changes update the observed
elements through `setElements()` instead of replacing all listeners. The
public `autoUpdate(elements, cb)` wrapper remains available to hints and
external consumers.

### B5. Investigated and rejected: tooltip node reuse

Rebuilding tooltip content with `replaceChildren` cost approximately 55 nodes
and 0.3 ms of script time per step. Reusing those nodes did not justify the
extra complexity.

## Before and after

Scene: 40 targets, 12 steps, 120 scroll frames. The baseline is
`bench/results/tourkit-baseline-0.3.2.json`; the later run is `tourkit.json`.

| Scenario                     | Metric              | 0.3.2 | 0.3.3       |
| ---------------------------- | ------------------- | ----- | ----------- |
| Unrelated container scroll   | LayoutCount         | 120   | **0**       |
|                              | RecalcStyleCount    | 241   | 121         |
|                              | ScriptDuration, ms  | 28.4  | 8–14        |
|                              | TaskDuration, ms    | 248   | 104–203     |
| Window scroll, moving target | LayoutCount         | 239   | **121–124** |
|                              | RecalcStyleCount    | 363   | 241–248     |
|                              | ScriptDuration, ms  | 30.7  | 18–28       |
| Eleven `next()` calls        | RecalcStyleCount    | 92    | 83–95       |
|                              | Median duration, ms | 33    | 33          |

Unrelated container scroll no longer causes forced layout. The remaining style
recalculation per frame also appeared on the control page under a fixed
overlay. Window-scroll layout work was halved by removing interleaved
reads/writes and repeated direction reads. `start()` and `next()` elapsed times
remained limited by animation frames rather than script execution.

At this historical checkpoint, 126 unit tests and 24 end-to-end tests passed,
and visual baselines were unchanged. These counts describe that release,
not the current test suite.

## Preserved invariants

- Host elements are not raised or restyled for highlighting.
- The SVG has no `viewBox`; geometry uses layout-viewport CSS pixels.
- `createAutoUpdater` is internal; the exported API remains `autoUpdate`.
- Reduced motion, accessibility attributes and focus trapping are preserved.
