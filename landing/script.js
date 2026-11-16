/* global window, document, navigator, Node */

(() => {
  "use strict";

  const header = document.querySelector("[data-header]");
  const menu = document.querySelector("[data-menu]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const toast = document.querySelector("[data-toast]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let toastTimer;
  let activeTour = null;

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  };

  const copyText = async (text, button) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }

    button?.classList.add("is-copied");
    window.setTimeout(() => button?.classList.remove("is-copied"), 1600);
    showToast("Copied to clipboard");
  };

  const closeMenu = () => {
    menu?.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
    menuToggle?.setAttribute("aria-label", "Open menu");
  };

  menuToggle?.addEventListener("click", () => {
    const willOpen = menuToggle.getAttribute("aria-expanded") !== "true";
    menuToggle.setAttribute("aria-expanded", String(willOpen));
    menuToggle.setAttribute("aria-label", willOpen ? "Close menu" : "Open menu");
    menu?.classList.toggle("is-open", willOpen);
  });

  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!menu?.contains(target) && !menuToggle?.contains(target)) closeMenu();
  });

  const syncHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 12);
  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () =>
      copyText(button.getAttribute("data-copy") ?? "", button)
    );
  });

  const codeTabs = [...document.querySelectorAll("[data-code-tab]")];
  const codePanels = [...document.querySelectorAll("[data-code-panel]")];

  const activateCodeTab = (name) => {
    codeTabs.forEach((tab) =>
      tab.setAttribute("aria-selected", String(tab.getAttribute("data-code-tab") === name))
    );
    codePanels.forEach((panel) => {
      const active = panel.getAttribute("data-code-panel") === name;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  };

  codeTabs.forEach((tab) =>
    tab.addEventListener("click", () => activateCodeTab(tab.getAttribute("data-code-tab")))
  );

  document.querySelector("[data-copy-code]")?.addEventListener("click", (event) => {
    const activePanel = document.querySelector("[data-code-panel].is-active code");
    copyText(activePanel?.textContent ?? "", event.currentTarget);
  });

  if (!reduceMotion && "IntersectionObserver" in window) {
    const revealObserver = new window.IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -35px" }
    );

    document
      .querySelectorAll(".reveal:not(.is-visible)")
      .forEach((element) => revealObserver.observe(element));
  } else {
    document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
  }

  const buildTour = () => {
    if (!window.TourKit?.createTour) return null;

    return window.TourKit.createTour({
      progress: true,
      stepNumbers: true,
      overlay: {
        opacity: 0.55,
        padding: 9,
        radius: 12,
      },
      steps: [
        {
          target: "#release-badge",
          title: "TourKit 0.5",
          content: "First things first: fast, accessible, fully MIT-licensed onboarding.",
          placement: "bottom-start",
        },
        {
          target: "#preview-navigation",
          title: "No-guesswork navigation",
          content:
            "Spotlight any element of your UI — even inside complex layouts and stacking contexts.",
          placement: "right",
        },
        {
          target: "#preview-metric",
          title: "Focus on value",
          content: "Guide users to their aha moment with short, contextual steps.",
          placement: "bottom",
        },
        {
          target: "#preview-chart",
          title: "Always in place",
          content: "The tooltip flips sides automatically and stays within the viewport.",
          placement: "left",
        },
        {
          target: "#install-command",
          title: "Ready to ship",
          content: "One command, a few lines of config — and your first tour is live.",
          placement: "top-start",
        },
      ],
    });
  };

  const startTour = async () => {
    if (!window.TourKit?.createTour) {
      showToast("Build the package first: npm run build");
      return;
    }

    if (activeTour?.isActive) await activeTour.exit(true);
    activeTour = buildTour();
    await activeTour?.start();
  };

  document.querySelector("#start-hero-tour")?.addEventListener("click", startTour);
  document.querySelector("#start-demo-tour")?.addEventListener("click", startTour);

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();
