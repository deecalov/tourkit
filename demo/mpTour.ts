import { createTour } from "../src/index";

export const MP_KEY = "demo:mp";

/**
 * Multi-page tour: the same definition is loaded on both pages,
 * persistProgress stores the step index and page 2 resumes where page 1
 * left off.
 */
export function createMpTour() {
  return createTour({
    progress: true,
    persistProgress: { key: MP_KEY },
    steps: [
      {
        target: "#hero-title",
        title: "Multi-page tour",
        content: "Step 1 lives on the first page.",
      },
      {
        target: "#to-page2",
        title: "Navigation",
        content: "Click the highlighted link — the tour resumes by itself on page 2.",
        // The click navigates away: bump the stored index to the next step in
        // advance so page 2 resumes with "its own" step.
        onShown: ({ index }) => {
          document
            .querySelector("#to-page2")
            ?.addEventListener("click", () => localStorage.setItem(MP_KEY, String(index + 1)), {
              once: true,
            });
        },
      },
      {
        target: "#p2-block",
        title: "Page 2 already",
        content: "Progress survived the navigation: the step index lives in localStorage.",
      },
      {
        target: "#p2-end",
        title: "The end",
        content: "Done — completing the tour clears the progress key.",
      },
    ],
  });
}
