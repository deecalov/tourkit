# TourKit vs Intro.js: performance benchmark

> Historical measurements: 2026-07-13, TourKit 0.3.3 vs Intro.js 8.3.2.
> Updated 2026-07-22 with driver.js 1.8.0 and TourKit 0.5.0; see section 6.
> The stand lives in `bench/`, outside the npm package. Run `npm run bench`
> from the repository root. Raw results are in `bench/results/*.json`.

## 1. Comparison boundaries

Intro.js is used as an npm development dependency and exercised as a black box
through its public API, `introJs.tour().setOptions(...).start()`. This benchmark
work did not copy or modify its implementation. Behavioral conclusions below
come from external DOM observations and metrics.

## 2. Methodology

### 2.1. Stand

`bench/grid.ts` and `bench/stand.css` create 40 target cards, a fixed side
scroll container (`#side-scroller`) containing `#nested-card`, and a tall spacer
for window scrolling. Two pages run the same 12-step scenario with bottom
placement, progress indicators and non-smooth scrolling:

- `bench/stand.html` and `stand.ts`: TourKit through `createTour`.
- `bench/introjs-stand.html` and `introjs-stand.ts`: Intro.js through its public API.

Both expose `window.benchApi` with `start`, `next`, `exit`, `startNested`, and
`highlightCenter`, so the same Playwright specification drives each library.

### 2.2. Measurements

`bench/bench.spec.ts` uses Playwright and the Chrome DevTools Protocol (CDP):

- Compare `Performance.getMetrics` before and after each scenario:
  `LayoutCount`, `RecalcStyleCount`, layout/style/script/task durations, and `Nodes`.
- Measure `start()` and each `next()` using `performance.now()`, ending after a
  settled frame represented by two `requestAnimationFrame` callbacks.
- `scrollWindow`: 120 frames at ±24 px with a moving viewport-relative target.
- `scrollSide`: the same scroll loop in a container with no tour targets.
  Captured scroll events reach the listeners but should not change geometry.
- `nestedTracking`: a single step on `#nested-card`; move its container ±16 px
  for 40 samples and measure the distance between target and spotlight centers.
- Memory: `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage`, measured
  before, during and after the tour, together with the `Nodes` counter.
- `control`: repeat the scroll loops without a tour to estimate measurement noise.

The runs use reduced motion, a 1280 x 800 viewport, one worker and no retries.

### 2.3. Limits

Results depend on hardware, browser and package versions. These runs used
HeadlessChrome 149; relative differences matter more than absolute timings.
Both libraries' `next()` times approach two frames, approximately 33 ms at
60 Hz, so work counters are more informative than elapsed time. Intro.js uses
page-coordinate layers, making window scrolling cheap at the cost discussed below.

## 3. TourKit 0.3.3 vs Intro.js 8.3.2

Typical recorded runs vary by approximately 10–20%.

### 3.1. Size and dependencies

| Metric                   | TourKit 0.3.3                 | Intro.js 8.3.2    |
| ------------------------ | ----------------------------- | ----------------- |
| JavaScript, brotli       | **7.36 KB** ESM; 7.57 KB IIFE | 15.52 KB minified |
| CSS, brotli              | 3.02 KB                       | 1.44 KB           |
| JavaScript + CSS, brotli | **10.4 KB**                   | 16.9 KB           |
| Runtime dependencies     | 0                             | 0                 |

TourKit's JavaScript was approximately half the size. Its larger stylesheet
included two themes and responsive controls; the combined transfer was about 40% smaller.

### 3.2. Start and navigation: 40 targets, 12 steps

| Metric                                   | TourKit | Intro.js |
| ---------------------------------------- | ------- | -------- |
| `start()` to first frame, ms             | 27–52   | 29–41    |
| Median `next()`, ms                      | 33      | 33       |
| Layouts across eleven `next()` calls     | 44–48   | 30–34    |
| Style recalculations across eleven calls | 83–95   | 77–80    |
| ScriptDuration across eleven calls, ms   | **3–6** | 23–33    |
| New DOM nodes across eleven calls        | **605** | 946      |

Elapsed times are similar because both wait for frames. TourKit used roughly
one fifth of the script time and created about one third fewer nodes. Its extra
layout work reflects viewport-coordinate positioning.

### 3.3. Window scrolling with an active tour: 120 frames

| Metric               | TourKit     | Intro.js                                 |
| -------------------- | ----------- | ---------------------------------------- |
| Layouts              | 121–124     | 13–20                                    |
| Style recalculations | 241–248     | 19–25                                    |
| ScriptDuration, ms   | 18–28       | 1.7–2.5                                  |
| Target tracking      | Every frame | Not required for page-coordinate drawing |

Intro.js's absolute highlight moves with the document during window scrolling.
TourKit pays for fixed layers, click-through cutouts and an SVG spotlight that
does not raise host elements. The corresponding correctness benefit appears in section 3.5.

### 3.4. Unrelated container scroll: 120 frames

| Metric               | TourKit 0.3.2 | TourKit 0.3.3 | Intro.js |
| -------------------- | ------------- | ------------- | -------- |
| Layouts              | 120           | **0**         | 0        |
| Style recalculations | 241           | 121–123       | 0        |
| ScriptDuration, ms   | 28.4          | 8–14          | 1.0–1.6  |

The v0.3.3 geometry checks eliminated forced layout for unrelated scrolling.
Intro.js does not react to those events; that is cheaper but also leaves
container-scrolled targets unsynchronized.

### 3.5. Correctness: target inside a scroll container

The container moves ±16 px for 40 samples. Error is the distance between
spotlight and target centers after the frame settles.

| Metric                | TourKit | Intro.js                             |
| --------------------- | ------- | ------------------------------------ |
| Initial error, px     | 0       | 0, with automatic scrolling disabled |
| Mean scroll error, px | **0**   | 8                                    |
| Maximum error, px     | **0**   | 16                                   |

Intro.js alternates between errors of 0 and 16 px because the overlay remains
static while the target moves away and returns. TourKit tracks each frame.
With Intro.js's default `scrollToElement: true`, the initial window scroll to
a target in the fixed container displaced the highlight by approximately
1150 px. For this tracking comparison automatic scrolling was disabled and
the target was centered first.

### 3.6. Memory and teardown

| Metric                                  | TourKit | Intro.js |
| --------------------------------------- | ------- | -------- |
| Active heap minus baseline, KB          | ~1040   | ~1150    |
| Heap after `exit()` minus baseline, KB  | ~1035   | ~1150    |
| Active DOM nodes minus baseline         | 70      | 61       |
| DOM nodes after `exit()` minus baseline | **6**   | 60       |

TourKit's node count returned close to the baseline. Intro.js retained about
60 nodes in the external `Nodes` measurement; their cause was not investigated.

## 4. Interpretation

- Page-coordinate drawing is inexpensive for window scrolling but can fail in
  fixed or nested scroll contexts. Viewport coordinates with frame updates cost
  roughly 0.15 ms of script time per scroll frame in this run.
- TourKit's spotlight leaves host targets in place. Intro.js adds target
  classes such as `.introjs-showElement`, visible through external DOM inspection.
- Navigation elapsed time was similar, with about five times less script work
  and 36% fewer created nodes for TourKit.
- In this historical comparison, TourKit's JavaScript was half the size while
  including its theme support.

## 5. Reproduce

```bash
npm ci             # Includes the benchmark libraries as development dependencies.
npm run bench      # control -> tourkit -> introjs -> driverjs; writes bench/results/.
```

Configure the scene with `?targets=40&steps=12` and the `SCROLL_FRAMES` and
`SCROLL_STEP_PX` constants in `bench/bench.spec.ts`.

## 6. driver.js 1.8.0: 2026-07-22 update with TourKit 0.5.0

`bench/driver-stand.ts` implements the same `BenchApi` using driver.js's public
API, with `animate: false` and `smoothScroll: false`. All three libraries were
measured on the same host with HeadlessChrome 149.

### 6.1. Start and navigation

| Metric                                 | TourKit 0.5.0 | driver.js 1.8.0 | Intro.js 8.3.2 |
| -------------------------------------- | ------------- | --------------- | -------------- |
| `start()` to first frame, ms           | 42.3          | 41.8            | 31.7           |
| Median `next()`, ms                    | 32.9          | 32.2            | 33.6           |
| Layouts across eleven calls            | 44            | 74              | 30             |
| ScriptDuration across eleven calls, ms | **4.8**       | **3.5**         | 30.8           |
| New DOM nodes across eleven calls      | 605           | **319**         | 946            |

All three wait for frames. TourKit and driver.js have comparable script time;
Intro.js used about seven times as much. driver.js created the fewest nodes,
with approximately 1.7 times as many layouts per transition as TourKit.

### 6.2. Window scrolling: 120 frames

| Metric               | TourKit                      | driver.js           | Intro.js |
| -------------------- | ---------------------------- | ------------------- | -------- |
| Layouts              | **121**, about one per frame | 480, four per frame | 19       |
| Style recalculations | 241                          | 490                 | 24       |
| ScriptDuration, ms   | **21.3**                     | 38.8                | 2.6      |

Intro.js's page-coordinate approach explains its low window-scroll cost.
TourKit batches reads and checks geometry before writing; driver.js triggered
four layouts per frame in this measurement.

### 6.3. Unrelated container scroll: 120 frames

| Metric             | TourKit | driver.js | Intro.js |
| ------------------ | ------- | --------- | -------- |
| Layouts            | **0**   | 0         | 0        |
| ScriptDuration, ms | 11.7    | 1.2       | 1.2      |

Neither comparison library reacted to container scrolling. TourKit processed
captured scroll events at about 0.1 ms of script time per frame, without forced layout.

### 6.4. Nested-container tracking

| Metric                | TourKit | driver.js | Intro.js |
| --------------------- | ------- | --------- | -------- |
| Initial error, px     | **0**   | 0         | 1174     |
| Mean scroll error, px | **0**   | 8         | 125      |
| Maximum error, px     | **0**   | 16        | 1190     |

driver.js's overlay remains static. Its 8 px average reflects the oscillating
±16 px scenario; continued scrolling in one direction would accumulate the
full displacement. TourKit remained aligned in every measured frame.

### 6.5. Memory and teardown

| Metric                              | TourKit | driver.js | Intro.js |
| ----------------------------------- | ------- | --------- | -------- |
| Active heap, MB                     | 2.63    | **2.34**  | 2.54     |
| Nodes after `exit()` minus baseline | **0**   | 0         | +59      |

### 6.6. Scope of the comparison

driver.js was fast and cleaned up its DOM, with four layouts per window-scroll
frame and static highlighting during container scrolling. This stand did not
provide it with TourKit's async-target waiting, hints, persistence or migration
adapter. Accessibility comparisons mentioned elsewhere in the repository use
separate audits; the tables above report the performance stand only.

Related documents: [Intro.js technical notes](introjs-analysis.md) and
[v0.3.3 performance improvements](tourkit-v0.3.3-perf.md).
