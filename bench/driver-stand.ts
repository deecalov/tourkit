/**
 * driver.js is exercised strictly as a black box through its public,
 * documented API (npm devDependency; sources are neither read nor copied —
 * the clean-room policy of this repository is not affected).
 *
 * The scenario mirrors bench/stand.ts: same grid, same step targets, same
 * "bottom" placement, progress on. `animate: false` for the same reason our
 * stand uses non-smooth scrolling: the bench must measure library work, not
 * an animation timeline.
 */
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { benchParams, buildGrid, stepTargetIds } from "./grid";
import type {} from "./types";

const params = benchParams();
buildGrid(params.targets);

let tour: Driver | null = null;

window.benchApi = {
  library: "driverjs",

  async start() {
    tour = driver({
      showProgress: true,
      animate: false,
      smoothScroll: false,
      steps: stepTargetIds(params.targets, params.steps).map((id, i) => ({
        element: `#${id}`,
        popover: {
          title: `Step ${i + 1}`,
          description: `Benchmark step ${i + 1} highlighting ${id}.`,
          side: "bottom",
        },
      })),
    });
    tour.drive();
  },

  async next() {
    tour?.moveNext();
  },

  async exit() {
    tour?.destroy();
    tour = null;
  },

  async startNested() {
    tour = driver({
      animate: false,
      smoothScroll: false,
      steps: [
        {
          element: "#nested-card",
          popover: {
            title: "Nested",
            description: "Target inside a scrollable container.",
            side: "bottom",
          },
        },
      ],
    });
    tour.drive();
  },

  highlightCenter() {
    // Public DOM contract: the dimming overlay is an SVG path whose last
    // subpath outlines the stage cutout: M{x+r},{y} h{w-2r} a{r},... v{h-2r} ...
    const d = document.querySelector(".driver-overlay path")?.getAttribute("d") ?? "";
    const sub = d.slice(d.lastIndexOf("M"));
    const m = sub.match(/M\s*([\d.-]+)\s*,?\s*([\d.-]+)/);
    const h = sub.match(/h\s*([\d.-]+)/);
    const v = sub.match(/v\s*([\d.-]+)/);
    const a = sub.match(/a\s*([\d.-]+)/);
    if (!m || !h || !v) return null;
    const r = a ? parseFloat(a[1]!) : 0;
    const x = parseFloat(m[1]!) - r;
    const y = parseFloat(m[2]!);
    const width = parseFloat(h[1]!) + 2 * r;
    const height = parseFloat(v[1]!) + 2 * r;
    return { x: x + width / 2, y: y + height / 2 };
  },
};
