import { bindTriggers, createTour, highlight, type Highlight } from "../src/index";
import { createHints, type Hints } from "../src/hints";
import { introJs } from "../src/compat/introjs";
import { injectStyles } from "../src/styles/inject";
import { createMpTour, MP_KEY } from "./mpTour";
import "../src/styles/styles.css";

const isDark = () => document.body.classList.contains("dark");

// Exposed for e2e scenarios (Playwright) and console experiments.
(window as unknown as Record<string, unknown>)["TourKitDemo"] = {
  createTour,
  createHints,
  highlight,
  injectStyles,
  introJs,
};

function buildJsTour() {
  return createTour({
    // The tooltip follows the page theme: light is the default, dark is opt-in.
    theme: isDark() ? "dark" : undefined,
    progress: true,
    stepNumbers: true,
    steps: [
      {
        title: "Welcome!",
        content: "A floating step without a target — centered tooltip, collapsed spotlight.",
      },
      {
        target: "#start-js",
        title: "Starting a tour",
        content: "The button you started from. The spotlight flowed over to it.",
        placement: "bottom-start",
      },
      {
        target: "#card-analytics",
        title: "Cards",
        content: "Multi-cutout: all three cards are lit, the tooltip anchors to the first.",
        highlight: ["#card-reports", "#card-team"],
      },
      {
        target: "#transformed-box",
        title: "Stacking context",
        content: "An element inside a transform container, highlighted without z-index hacks.",
        disableInteraction: true,
      },
      {
        target: "#far-card",
        title: "Auto-scroll",
        content: "The page scrolled on its own. The ← → keys work too.",
        placement: "top",
      },
      {
        target: "#profile",
        title: "The end",
        content: "", // rendered by renderStep below
        placement: "bottom-end",
        renderStep: (_ctx, host) => {
          const wrap = document.createElement("div");
          wrap.append("Custom step rendering: live DOM without allowHTML. Rate this tour: ");
          const select = document.createElement("select");
          select.id = "demo-rating";
          for (const value of ["5", "4", "3"]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = "★".repeat(Number(value));
            select.append(option);
          }
          wrap.append(select);
          host.append(wrap);
          const onChange = () => console.log("[demo] rating:", select.value);
          select.addEventListener("change", onChange);
          return () => select.removeEventListener("change", onChange); // cleanup
        },
      },
    ],
  });
}

document.getElementById("start-js")!.addEventListener("click", () => {
  const tour = buildJsTour();
  tour.on("complete", ({ reason }) => console.log("[demo] complete:", reason));
  tour.on("exit", () => console.log("[demo] exit"));
  void tour.start();
});

// The "Tour from data attributes" button is marked with data-tour-trigger:
// a declarative launch with no handler (the server-rendered / MVC scenario).
bindTriggers();

document.getElementById("start-mp")!.addEventListener("click", () => {
  localStorage.removeItem(MP_KEY); // an explicit launch always starts over
  void createMpTour().start();
});

document.getElementById("theme-toggle")!.addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

let hints: Hints | null = null;

document.getElementById("toggle-hints")!.addEventListener("click", (e) => {
  e.stopPropagation(); // keep the document click from closing the popover at once
  if (hints) {
    hints.destroy();
    hints = null;
    return;
  }

  hints = createHints({
    theme: isDark() ? "dark" : undefined,
    rememberDismissed: { key: "demo:hints" },
    hints: [
      {
        target: "#card-analytics",
        content: "Metrics refresh every 5 minutes.",
        id: "analytics",
      },
      {
        target: "#card-reports",
        content: "Exports can run on a schedule.",
        id: "reports",
        markerPosition: "top-end",
        placement: "right",
      },
      {
        target: "#profile",
        content: "Account settings live here.",
        id: "profile",
        markerPosition: "bottom-center",
      },
    ],
  });
  hints.on("dismiss", ({ hint }) => console.log("[demo] hint dismissed:", hint.id));
  hints.render();
});

// SPA scenario: the second step's target mounts late — the tour waits for it
// (waitForTarget), the spotlight flows over, and a click on it moves on.
document.getElementById("start-async")!.addEventListener("click", () => {
  document.getElementById("async-panel")?.remove();

  const tour = createTour({
    theme: isDark() ? "dark" : undefined,
    steps: [
      {
        title: "Async target",
        content: "The panel is not mounted yet — the tour waits for it (waitForTarget).",
      },
      {
        target: "#async-panel",
        title: "Click the panel",
        content: "It appeared after 900 ms. Clicking it moves the tour on (advanceOn).",
        advanceOn: true,
      },
      { title: "Done", content: "Waiting for targets and interactive steps both work." },
    ],
  });
  void tour.start();

  window.setTimeout(() => {
    const panel = document.createElement("section");
    panel.className = "card";
    panel.id = "async-panel";
    panel.innerHTML = "<h3>Lazy panel</h3><p>Mounted after the tour started.</p>";
    document.querySelector(".grid")!.append(panel);
  }, 900);
});

// Modal onboarding: the page behind is inert and cannot be scrolled.
document.getElementById("start-modal")!.addEventListener("click", () => {
  void createTour({
    theme: isDark() ? "dark" : undefined,
    modal: true,
    lockScroll: true,
    steps: [
      {
        title: "Modal mode",
        content: "Everything outside the tour is inert and the page scroll is frozen.",
      },
      {
        target: "#card-team",
        title: "Still scrolls to targets",
        content: "Locking blocks the user's scrolling, not the tour's own.",
      },
    ],
  }).start();
});

// Standalone spotlight without a tooltip: highlight() lights an element up,
// Esc or a backdrop click removes it.
let spot: Highlight | null = null;
document.getElementById("spotlight-btn")!.addEventListener("click", () => {
  spot?.destroy();
  spot = highlight("#card-reports", { theme: isDark() ? "dark" : undefined });
});

document.getElementById("start-compat")!.addEventListener("click", () => {
  // A migration layer in action: the intro.js-shaped API on top of TourKit.
  void introJs
    .tour()
    .setOptions({
      showProgress: true,
      steps: [
        { title: "Compat mode", intro: "These are intro.js options rendered by TourKit." },
        {
          element: "#card-team",
          intro: "intro.js positions are mapped automatically.",
          position: "top-middle-aligned",
        },
      ],
    })
    .oncomplete(() => console.log("[demo] compat complete"))
    .start();
});
