import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import type {} from "./types";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(DIR, "results");

/** Scenario parameters; keep in sync with the methodology document. */
const TARGETS = 40;
const STEPS = 12;
const SCROLL_FRAMES = 120;
const SCROLL_STEP_PX = 24;

/** Cumulative renderer counters from CDP `Performance.getMetrics`. */
interface Counters {
  layoutCount: number;
  recalcStyleCount: number;
  layoutDurationMs: number;
  recalcStyleDurationMs: number;
  scriptDurationMs: number;
  taskDurationMs: number;
  nodes: number;
}

const round = (x: number) => Math.round(x * 100) / 100;

async function snapshot(cdp: CDPSession): Promise<Counters> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const value = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
  return {
    layoutCount: value("LayoutCount"),
    recalcStyleCount: value("RecalcStyleCount"),
    layoutDurationMs: value("LayoutDuration") * 1000,
    recalcStyleDurationMs: value("RecalcStyleDuration") * 1000,
    scriptDurationMs: value("ScriptDuration") * 1000,
    taskDurationMs: value("TaskDuration") * 1000,
    nodes: value("Nodes"),
  };
}

function delta(before: Counters, after: Counters): Counters {
  return {
    layoutCount: after.layoutCount - before.layoutCount,
    recalcStyleCount: after.recalcStyleCount - before.recalcStyleCount,
    layoutDurationMs: round(after.layoutDurationMs - before.layoutDurationMs),
    recalcStyleDurationMs: round(after.recalcStyleDurationMs - before.recalcStyleDurationMs),
    scriptDurationMs: round(after.scriptDurationMs - before.scriptDurationMs),
    taskDurationMs: round(after.taskDurationMs - before.taskDurationMs),
    nodes: after.nodes - before.nodes,
  };
}

function seriesStats(samples: number[]): { meanMs: number; medianMs: number; maxMs: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  return {
    meanMs: round(mean),
    medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
  };
}

/** Forces GC first so the number reflects live objects, not garbage. */
async function heapUsed(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return Math.round(usedSize);
}

interface LibraryConfig {
  library: string;
  version: string;
  /** Page path of the stand, e.g. "/bench/stand.html". */
  stand: string;
  /** Selector that must be visible while the tour is running. */
  probe: string;
}

/**
 * Correctness under nested scrolling: a one-step tour on a target inside an
 * `overflow: scroll` container; the container is scrolled step by step and
 * the distance between the highlight center and the target center is
 * sampled after each settled frame. A library that only tracks window
 * scroll drifts by the full scrolled distance.
 */
async function benchNestedTracking(page: Page, cdp: CDPSession) {
  // Neutral starting state: window at the top, the card pre-centered inside
  // its container — no library needs to scroll anything on start, so the
  // scenario isolates pure scroll tracking.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const scroller = document.getElementById("side-scroller")!;
    const target = document.getElementById("nested-card")! as HTMLElement;
    scroller.scrollTop = target.offsetTop - (scroller.clientHeight - target.offsetHeight) / 2;
  });

  await page.evaluate(() => window.benchApi.startNested());

  const before = await snapshot(cdp);
  const { settled, errors } = await page.evaluate(async () => {
    const scroller = document.getElementById("side-scroller")!;
    const target = document.getElementById("nested-card")!;
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    const sample = () => {
      const c = window.benchApi.highlightCenter();
      const r = target.getBoundingClientRect();
      return c === null
        ? Number.NaN
        : Math.hypot(c.x - (r.left + r.width / 2), c.y - (r.top + r.height / 2));
    };

    // Settle after start (the library may have scrolled something itself).
    for (let i = 0; i < 5; i++) await frame();
    const settled = sample();

    const out: number[] = [];
    for (let i = 0; i < 40; i++) {
      scroller.scrollTop += (i % 2 === 0 ? 1 : -1) * 16;
      // Two frames: the resync runs in the first, the sample reads the second.
      await frame();
      await frame();
      out.push(sample());
    }
    return { settled, errors: out };
  });
  const counters = delta(before, await snapshot(cdp));

  await page.evaluate(() => window.benchApi.exit());

  const valid = errors.filter((e) => Number.isFinite(e));
  return {
    samples: errors.length,
    /** Distance highlight↔target right after start, before any wiggling. */
    settledErrorPx: Number.isFinite(settled) ? round(settled) : null,
    meanErrorPx: valid.length ? round(valid.reduce((s, x) => s + x, 0) / valid.length) : null,
    maxErrorPx: valid.length ? round(Math.max(...valid)) : null,
    counters,
  };
}

async function benchLibrary(page: Page, cfg: LibraryConfig) {
  await page.goto(`${cfg.stand}?targets=${TARGETS}&steps=${STEPS}`);
  await page.waitForFunction(() => "benchApi" in window);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("HeapProfiler.enable");

  const heapBaseline = await heapUsed(cdp);

  // --- start(): call → first settled frame -------------------------------
  const beforeStart = await snapshot(cdp);
  const startMs = await page.evaluate(async () => {
    const settled = () =>
      new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const t0 = performance.now();
    await window.benchApi.start();
    await settled();
    return performance.now() - t0;
  });
  const startCounters = delta(beforeStart, await snapshot(cdp));
  await expect(page.locator(cfg.probe)).toBeVisible();

  // --- next() × (STEPS - 1): per-transition timings ----------------------
  const beforeNext = await snapshot(cdp);
  const nextTimes = await page.evaluate(async (count) => {
    const settled = () =>
      new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const times: number[] = [];
    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      await window.benchApi.next();
      await settled();
      times.push(performance.now() - t0);
    }
    return times;
  }, STEPS - 1);
  const nextCounters = delta(beforeNext, await snapshot(cdp));

  // --- scroll resync: window scroll moves the target every frame ---------
  const beforeWindowScroll = await snapshot(cdp);
  const scrollWindowMs = await page.evaluate(
    async ({ frames, px }) => {
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        window.scrollBy(0, (i % 2 === 0 ? 1 : -1) * px);
        await frame();
      }
      await frame();
      return performance.now() - t0;
    },
    { frames: SCROLL_FRAMES, px: SCROLL_STEP_PX }
  );
  const scrollWindowCounters = delta(beforeWindowScroll, await snapshot(cdp));

  // --- scroll noise: a fixed side container scrolls, target stays put ----
  const beforeSideScroll = await snapshot(cdp);
  const scrollSideMs = await page.evaluate(
    async ({ frames, px }) => {
      const el = document.getElementById("side-scroller")!;
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        el.scrollTop += (i % 2 === 0 ? 1 : -1) * px;
        await frame();
      }
      await frame();
      return performance.now() - t0;
    },
    { frames: SCROLL_FRAMES, px: SCROLL_STEP_PX }
  );
  const scrollSideCounters = delta(beforeSideScroll, await snapshot(cdp));

  // --- memory footprint and teardown --------------------------------------
  const heapActive = await heapUsed(cdp);
  const nodesActive = (await snapshot(cdp)).nodes;

  await page.evaluate(() => window.benchApi.exit());
  await expect(page.locator(cfg.probe)).toHaveCount(0);

  const heapAfterExit = await heapUsed(cdp);
  const nodesAfterExit = (await snapshot(cdp)).nodes;

  // --- nested-scroll tracking correctness ---------------------------------
  const nestedTracking = await benchNestedTracking(page, cdp);

  return {
    library: cfg.library,
    version: cfg.version,
    timestamp: new Date().toISOString(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    params: {
      targets: TARGETS,
      steps: STEPS,
      scrollFrames: SCROLL_FRAMES,
      scrollStepPx: SCROLL_STEP_PX,
      viewport: { width: 1280, height: 800 },
      reducedMotion: true,
    },
    scenarios: {
      start: { ms: round(startMs), counters: startCounters },
      next: {
        ...seriesStats(nextTimes),
        samples: nextTimes.map(round),
        counters: nextCounters,
      },
      scrollWindow: { totalMs: round(scrollWindowMs), counters: scrollWindowCounters },
      scrollSide: { totalMs: round(scrollSideMs), counters: scrollSideCounters },
      nestedTracking,
    },
    memory: {
      heapBaselineBytes: heapBaseline,
      heapActiveBytes: heapActive,
      heapAfterExitBytes: heapAfterExit,
      nodesActive,
      nodesAfterExit,
    },
  };
}

function writeResult(name: string, data: unknown): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`[bench] ${name}:`);
  console.log(JSON.stringify(data, null, 2));
}

test.describe("performance bench", () => {
  /**
   * Noise floor: the same page and the same scroll loops with no tour
   * running. Library counters should be read as "scenario minus control".
   */
  test("control (no tour)", async ({ page }) => {
    await page.goto(`/bench/stand.html?targets=${TARGETS}&steps=${STEPS}`);
    await page.waitForFunction(() => "benchApi" in window);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    const beforeWindowScroll = await snapshot(cdp);
    await page.evaluate(
      async ({ frames, px }) => {
        const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        for (let i = 0; i < frames; i++) {
          window.scrollBy(0, (i % 2 === 0 ? 1 : -1) * px);
          await frame();
        }
        await frame();
      },
      { frames: SCROLL_FRAMES, px: SCROLL_STEP_PX }
    );
    const scrollWindowCounters = delta(beforeWindowScroll, await snapshot(cdp));

    const beforeSideScroll = await snapshot(cdp);
    await page.evaluate(
      async ({ frames, px }) => {
        const el = document.getElementById("side-scroller")!;
        const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        for (let i = 0; i < frames; i++) {
          el.scrollTop += (i % 2 === 0 ? 1 : -1) * px;
          await frame();
        }
        await frame();
      },
      { frames: SCROLL_FRAMES, px: SCROLL_STEP_PX }
    );
    const scrollSideCounters = delta(beforeSideScroll, await snapshot(cdp));

    writeResult("control", {
      library: "control",
      timestamp: new Date().toISOString(),
      scenarios: {
        scrollWindow: { counters: scrollWindowCounters },
        scrollSide: { counters: scrollSideCounters },
      },
    });
  });

  test("tourkit", async ({ page }) => {
    const pkg = JSON.parse(readFileSync(path.join(DIR, "..", "package.json"), "utf8")) as {
      version: string;
    };
    const result = await benchLibrary(page, {
      library: "tourkit",
      version: pkg.version,
      stand: "/bench/stand.html",
      probe: ".tk-tooltip",
    });
    writeResult("tourkit", result);
  });

  test("introjs", async ({ page }) => {
    const standFile = path.join(DIR, "introjs-stand.html");
    test.skip(!existsSync(standFile), "intro.js stand is not built (phase C)");

    const pkgFile = path.join(DIR, "..", "node_modules", "intro.js", "package.json");
    const version = existsSync(pkgFile)
      ? (JSON.parse(readFileSync(pkgFile, "utf8")) as { version: string }).version
      : "unknown";

    const result = await benchLibrary(page, {
      library: "introjs",
      version,
      stand: "/bench/introjs-stand.html",
      probe: ".introjs-tooltip",
    });
    writeResult("introjs", result);
  });

  test("driverjs", async ({ page }) => {
    const standFile = path.join(DIR, "driver-stand.html");
    test.skip(!existsSync(standFile), "driver.js stand is not built");

    const pkgFile = path.join(DIR, "..", "node_modules", "driver.js", "package.json");
    const version = existsSync(pkgFile)
      ? (JSON.parse(readFileSync(pkgFile, "utf8")) as { version: string }).version
      : "unknown";

    const result = await benchLibrary(page, {
      library: "driverjs",
      version,
      stand: "/bench/driver-stand.html",
      probe: ".driver-popover",
    });
    writeResult("driverjs", result);
  });
});
