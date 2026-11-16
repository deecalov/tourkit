/**
 * intro.js is exercised strictly as a black box through its public,
 * documented API (npm devDependency; sources are neither read nor copied —
 * the clean-room policy of this repository is not affected).
 *
 * The scenario mirrors bench/stand.ts: same grid, same step targets, same
 * "bottom" placement, progress bar + bullets, non-smooth scrolling.
 */
import introJs from "intro.js";
import "intro.js/introjs.css";
import { benchParams, buildGrid, stepTargetIds } from "./grid";
import type {} from "./types";

const params = benchParams();
buildGrid(params.targets);

type IntroTour = ReturnType<(typeof introJs)["tour"]>;
let tour: IntroTour | null = null;

window.benchApi = {
  library: "introjs",

  async start() {
    tour = introJs.tour();
    tour.setOptions({
      showProgress: true,
      showBullets: true,
      scrollToElement: true,
      steps: stepTargetIds(params.targets, params.steps).map((id, i) => ({
        element: `#${id}`,
        title: `Step ${i + 1}`,
        intro: `Benchmark step ${i + 1} highlighting ${id}.`,
        position: "bottom",
      })),
    });
    await tour.start();
  },

  async next() {
    await tour?.nextStep();
  },

  async exit() {
    await tour?.exit(true);
    tour = null;
  },

  async startNested() {
    tour = introJs.tour();
    tour.setOptions({
      // The card is pre-centered and fully visible; disabling the built-in
      // scroll isolates pure tracking (their scroll heuristics jump the
      // window when the target lives in a fixed scrollable container).
      scrollToElement: false,
      steps: [
        {
          element: "#nested-card",
          title: "Nested",
          intro: "Target inside a scrollable container.",
          position: "bottom",
        },
      ],
    });
    await tour.start();
  },

  highlightCenter() {
    // Public DOM contract: the helper layer visually frames the highlighted
    // element; its bounding rect center must coincide with the target center.
    const el = document.querySelector(".introjs-helperLayer");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },
};
