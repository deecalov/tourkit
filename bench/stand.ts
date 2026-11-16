import { createTour, type Tour } from "../src/index";
import "../src/styles/styles.css";
import { benchParams, buildGrid, stepTargetIds } from "./grid";
import type {} from "./types";

const params = benchParams();
buildGrid(params.targets);

let tour: Tour | null = null;

window.benchApi = {
  library: "tourkit",

  async start() {
    tour = createTour({
      progress: true,
      stepNumbers: true,
      // Deterministic jumps instead of smooth scrolling: the scenario must
      // measure library work, not the browser's scroll animation timeline.
      scroll: { behavior: "auto" },
      steps: stepTargetIds(params.targets, params.steps).map((id, i) => ({
        target: `#${id}`,
        title: `Step ${i + 1}`,
        content: `Benchmark step ${i + 1} highlighting ${id}.`,
        placement: "bottom",
      })),
    });
    await tour.start();
  },

  async next() {
    await tour?.next();
  },

  async exit() {
    await tour?.exit(true);
    tour = null;
  },

  async startNested() {
    tour = createTour({
      scroll: { behavior: "auto" },
      steps: [
        {
          target: "#nested-card",
          title: "Nested",
          content: "Target inside a scrollable container.",
          placement: "bottom",
        },
      ],
    });
    await tour.start();
  },

  highlightCenter() {
    // The ring path contains only the cutout subpaths; reconstruct the rect
    // from the generator's own format: M{x+r} {y} h{w-2r} a{r}... v{h-2r}.
    const d = document.querySelector(".tk-overlay__ring")?.getAttribute("d") ?? "";
    const m = d.match(/M([\d.-]+) ([\d.-]+)h([\d.-]+)a([\d.-]+)/);
    const v = d.match(/v([\d.-]+)/);
    if (!m || !v) return null;
    const r = parseFloat(m[4]!);
    const x = parseFloat(m[1]!) - r;
    const y = parseFloat(m[2]!);
    const width = parseFloat(m[3]!) + 2 * r;
    const height = parseFloat(v[1]!) + 2 * r;
    return { x: x + width / 2, y: y + height / 2 };
  },
};
