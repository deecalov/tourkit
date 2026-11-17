import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour } from "../src/tour/tour";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createTour (DOM integration)", () => {
  let target: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("button");
    target.id = "demo-target";
    target.textContent = "Target";
    document.body.append(target);
  });

  afterEach(async () => {
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("mounts the root with overlay, tooltip and live region", async () => {
    const tour = createTour({
      steps: [{ target: "#demo-target", title: "Hello", content: "World" }],
    });

    await tour.start();

    const root = document.querySelector(".tk-root")!;
    expect(root).not.toBeNull();
    expect(root.querySelector(".tk-overlay")).not.toBeNull();
    expect(root.querySelector(".tk-tooltip")).not.toBeNull();
    expect(root.querySelector(".tk-live")?.textContent).toContain("1");
    expect(root.querySelector(".tk-tooltip__title")?.textContent).toBe("Hello");
    expect(root.querySelector(".tk-tooltip__content")?.textContent).toBe("World");

    tour.destroy();
    expect(document.querySelector(".tk-root")).toBeNull();
  });

  it("renders untrusted content as inert text by default (XSS-safe)", async () => {
    const tour = createTour({
      steps: [{ content: '<img src="x" onerror="window.__pwned = true">' }],
    });

    await tour.start();

    const content = document.querySelector(".tk-tooltip__content")!;
    expect(content.querySelector("img")).toBeNull();
    expect(content.textContent).toContain("<img");

    tour.destroy();
  });

  it("renders HTML when allowHTML is enabled", async () => {
    const tour = createTour({
      allowHTML: true,
      steps: [{ content: "<strong>bold</strong>" }],
    });

    await tour.start();

    expect(document.querySelector(".tk-tooltip__content strong")).not.toBeNull();

    tour.destroy();
  });

  it("navigates with the next button and completes on done", async () => {
    const complete = vi.fn();
    const tour = createTour({
      steps: [{ content: "one" }, { content: "two" }],
    });
    tour.on("complete", complete);

    await tour.start();
    expect(tour.index).toBe(0);

    const next = () => document.querySelector<HTMLButtonElement>(".tk-button--primary")!;

    expect(next().textContent).toBe("Next");
    next().click();
    await vi.waitFor(() => expect(tour.index).toBe(1));

    expect(next().dataset["tkAction"]).toBe("done");
    next().click();

    await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });
    expect(complete).toHaveBeenCalledWith({ reason: "finished" });
  });

  it("skip button completes with 'skipped'", async () => {
    const complete = vi.fn();
    const tour = createTour({ steps: [{ content: "one" }, { content: "two" }] });
    tour.on("complete", complete);

    await tour.start();
    document.querySelector<HTMLButtonElement>(".tk-tooltip__close")!.click();

    await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });
    expect(complete).toHaveBeenCalledWith({ reason: "skipped" });
  });

  it("exits on Escape", async () => {
    const tour = createTour({ steps: [{ content: "one" }] });
    await tour.start();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });
    expect(document.querySelector(".tk-root")).toBeNull();
  });

  it("renders bullets and jumps via bullet click", async () => {
    const tour = createTour({
      steps: [{ content: "one" }, { content: "two" }, { content: "three" }],
    });
    await tour.start();

    const bullets = document.querySelectorAll<HTMLButtonElement>(".tk-tooltip__bullet");
    expect(bullets).toHaveLength(3);
    expect(bullets[0]!.getAttribute("aria-current")).toBe("step");

    bullets[2]!.click();
    await vi.waitFor(() => expect(tour.index).toBe(2));

    tour.destroy();
  });

  it("renders a segmented progress bar with done/current states", async () => {
    const tour = createTour({
      progress: true,
      steps: [{ content: "one" }, { content: "two" }, { content: "three" }],
    });
    await tour.start();
    await tour.goTo(1);

    const bar = document.querySelector(".tk-tooltip__progress")!;
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("67");
    expect(bar.getAttribute("aria-valuetext")).toBe("2 of 3");

    const segments = bar.querySelectorAll(".tk-tooltip__progress-seg");
    expect(segments).toHaveLength(3);
    expect(segments[0]!.classList.contains("tk-tooltip__progress-seg--done")).toBe(true);
    expect(segments[1]!.classList.contains("tk-tooltip__progress-seg--current")).toBe(true);
    expect(segments[2]!.className).toBe("tk-tooltip__progress-seg");

    tour.destroy();
  });

  it("shows the step number inside the active crumb only", async () => {
    const tour = createTour({
      steps: [{ content: "one" }, { content: "two" }, { content: "three" }],
    });
    await tour.start();
    await tour.goTo(1);

    const bullets = document.querySelectorAll<HTMLButtonElement>(".tk-tooltip__bullet");
    expect(bullets[1]!.classList.contains("tk-tooltip__bullet--active")).toBe(true);
    expect(bullets[1]!.textContent).toBe("2");
    expect(bullets[0]!.textContent).toBe("");
    expect(bullets[2]!.textContent).toBe("");

    tour.destroy();
  });

  it("falls back to data attributes when no steps are configured", async () => {
    target.setAttribute("data-tour", "From the DOM");

    const tour = createTour();
    const ok = await tour.start();

    expect(ok).toBe(true);
    expect(tour.steps).toHaveLength(1);
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("From the DOM");

    tour.destroy();
  });

  it("returns false when there is nothing to show", async () => {
    const tour = createTour();
    expect(await tour.start()).toBe(false);
    expect(document.querySelector(".tk-root")).toBeNull();
  });

  it("rejects unknown event names at compile time", () => {
    const tour = createTour();
    // @ts-expect-error -- typo'd event names must not typecheck
    tour.on("compleet", () => {});
    // @ts-expect-error -- typo'd event names must not typecheck
    tour.once("beforexit", () => {});
  });

  it("applies theme and zIndex to the root", async () => {
    const tour = createTour({
      theme: "dark",
      zIndex: 5000,
      steps: [{ content: "x" }],
    });

    await tour.start();

    const root = document.querySelector<HTMLElement>(".tk-root")!;
    expect(root.dataset["tkTheme"]).toBe("dark");
    expect(root.style.getPropertyValue("--tk-z")).toBe("5000");

    tour.destroy();
  });

  it("moves focus into the tooltip and restores it on destroy", async () => {
    target.focus();
    const tour = createTour({ steps: [{ content: "x" }] });

    await tour.start();
    await flush();

    const root = document.querySelector(".tk-root")!;
    expect(root.contains(document.activeElement)).toBe(true);

    tour.destroy();
    expect(document.activeElement).toBe(target);
  });

  describe("focus trap", () => {
    const pressTab = (shiftKey = false) =>
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true })
      );

    it("includes the interactive target in the Tab cycle", async () => {
      // jsdom reports offsetParent as null for everything; fake visibility.
      const offsetSpy = vi
        .spyOn(HTMLElement.prototype, "offsetParent", "get")
        .mockReturnValue(document.body);

      const tour = createTour({ steps: [{ target: "#demo-target", content: "x" }] });
      await tour.start();
      await flush();

      // Cycle: [close, done, target]; focus starts on the primary (done).
      expect(document.activeElement?.className).toContain("tk-button--primary");

      pressTab();
      expect(document.activeElement).toBe(target);

      pressTab(); // wraps back into the tooltip
      expect(document.activeElement?.className).toContain("tk-tooltip__close");

      pressTab(true); // Shift+Tab back to the target
      expect(document.activeElement).toBe(target);

      tour.destroy();
      offsetSpy.mockRestore();
    });

    it("follows a replaced target: Tab reaches the new element after refresh()", async () => {
      const offsetSpy = vi
        .spyOn(HTMLElement.prototype, "offsetParent", "get")
        .mockReturnValue(document.body);

      const tour = createTour({ steps: [{ target: "#demo-target", content: "x" }] });
      await tour.start();
      await flush();

      target.remove();
      const replacement = document.createElement("button");
      replacement.id = "demo-target";
      replacement.textContent = "Replacement";
      document.body.append(replacement);

      tour.refresh(); // re-resolves the selector and syncs the tooltip context

      // Focus starts on the primary button; Tab must land on the NEW node.
      document.querySelector<HTMLButtonElement>(".tk-button--primary")!.focus();
      pressTab();
      expect(document.activeElement).toBe(replacement);

      tour.destroy();
      replacement.remove();
      offsetSpy.mockRestore();
    });

    it("keeps the target out of the cycle when interaction is disabled", async () => {
      const offsetSpy = vi
        .spyOn(HTMLElement.prototype, "offsetParent", "get")
        .mockReturnValue(document.body);

      const tour = createTour({
        steps: [{ target: "#demo-target", content: "x", disableInteraction: true }],
      });
      await tour.start();
      await flush();

      const seen = new Set<Element>();
      for (let i = 0; i < 5; i++) {
        pressTab();
        if (document.activeElement) seen.add(document.activeElement);
      }
      expect(seen.has(target)).toBe(false);

      tour.destroy();
      offsetSpy.mockRestore();
    });

    it("keeps a position:fixed target reachable in the Tab cycle", async () => {
      // Browsers report offsetParent === null for fixed elements even when
      // they are visible (spec) — mimic that to exercise the fallback.
      const offsetSpy = vi
        .spyOn(HTMLElement.prototype, "offsetParent", "get")
        .mockImplementation(function (this: HTMLElement) {
          return this.style.position === "fixed" ? null : document.body;
        });

      target.style.position = "fixed";
      const tour = createTour({ steps: [{ target: "#demo-target", content: "x" }] });
      await tour.start();
      await flush();

      // Cycle: [close, done, target]; focus starts on the primary (done).
      expect(document.activeElement?.className).toContain("tk-button--primary");
      pressTab();
      expect(document.activeElement).toBe(target);

      tour.destroy();
      offsetSpy.mockRestore();
    });
  });

  describe("Escape and host inputs", () => {
    it("ignores Escape while a host input outside the tour is focused", async () => {
      const input = document.createElement("input");
      document.body.append(input);

      const tour = createTour({ steps: [{ content: "x" }] });
      await tour.start();
      await flush();

      input.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
      expect(tour.isActive).toBe(true); // Esc belonged to the input

      // With focus back inside the tour UI, Esc exits as usual.
      document.querySelector<HTMLButtonElement>(".tk-button--primary")!.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });

      input.remove();
    });
  });

  describe("explicit undefined options (wrappers forwarding unset props)", () => {
    it("placement: undefined still renders an anchored step", async () => {
      target.getBoundingClientRect = () =>
        ({
          x: 100,
          y: 100,
          width: 50,
          height: 20,
          top: 100,
          left: 100,
          right: 150,
          bottom: 120,
        }) as DOMRect;
      const tour = createTour({
        placement: undefined,
        steps: [{ target: "#demo-target", content: "anchored" }],
      });

      expect(await tour.start()).toBe(true);
      expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("anchored");
      expect(document.querySelector(".tk-tooltip")!.classList.contains("tk-tooltip--bottom")).toBe(
        true
      );
      tour.destroy();
    });

    it("buttons: { next: undefined } keeps the default Next button", async () => {
      const tour = createTour({
        buttons: { next: undefined },
        steps: [{ content: "a" }, { content: "b" }],
      });
      await tour.start();

      expect(document.querySelector(".tk-button--primary")?.textContent).toBe("Next");
      tour.destroy();
    });
  });

  describe("dynamic DOM", () => {
    const fakeRect = (x: number, y: number, width: number, height: number) =>
      ({
        x,
        y,
        width,
        height,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
      }) as DOMRect;

    it("scrolls to a target that onBeforeShow mounted", async () => {
      const scrolled = vi.fn();
      const tour = createTour({
        overlay: { transitionMs: 0 },
        scroll: { behavior: "auto" },
        steps: [
          { content: "intro" },
          {
            target: "#prepared",
            content: "prepared by the hook",
            onBeforeShow: () => {
              // Typical use: open a panel / switch a tab so the target exists.
              const el = document.createElement("div");
              el.id = "prepared";
              el.getBoundingClientRect = () => fakeRect(100, 2000, 50, 20); // below the fold
              (el as HTMLElement & { scrollIntoView: unknown }).scrollIntoView = scrolled;
              document.body.append(el);
            },
          },
        ],
      });
      await tour.start();
      await tour.next();

      expect(scrolled).toHaveBeenCalledTimes(1);
      expect(document.querySelector(".tk-tooltip")!.classList.contains("tk-tooltip--center")).toBe(
        false
      );
      tour.destroy();
    });

    it("re-resolves a selector target after the node is replaced (refresh)", async () => {
      const first = document.createElement("div");
      first.id = "dyn";
      first.getBoundingClientRect = () => fakeRect(10, 10, 50, 20);
      document.body.append(first);

      const tour = createTour({ steps: [{ target: "#dyn", content: "x" }] });
      await tour.start();

      first.remove();
      const second = document.createElement("div");
      second.id = "dyn";
      second.getBoundingClientRect = () => fakeRect(100, 50, 40, 20);
      document.body.append(second);

      tour.refresh();

      // Stage = rect inflated by overlay.padding (8): x 92, y 42 → inner
      // subpath starts at M(x + radius) y = M100 42.
      const d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
      expect(d).toContain("M100 42");

      tour.destroy();
    });

    it("covers extra highlight cutouts with interaction guards", async () => {
      target.getBoundingClientRect = () => fakeRect(100, 100, 60, 24);
      const extra = document.createElement("div");
      extra.id = "extra";
      let extraRect = fakeRect(300, 300, 50, 30);
      extra.getBoundingClientRect = () => extraRect;
      document.body.append(extra);

      const tour = createTour({
        disableInteraction: true,
        steps: [{ target: "#demo-target", content: "x", highlight: ["#extra"] }],
      });
      await tour.start();

      expect(document.querySelectorAll(".tk-interaction-guard")).toHaveLength(2);

      // Hiding the extra collapses its rect — its guard must not linger at (0,0).
      extraRect = fakeRect(0, 0, 0, 0);
      tour.refresh();
      expect(document.querySelectorAll(".tk-interaction-guard")).toHaveLength(1);

      tour.destroy();
      expect(document.querySelectorAll(".tk-interaction-guard")).toHaveLength(0);
    });

    it("guards highlight-only steps without a main target", async () => {
      const extra = document.createElement("div");
      extra.id = "solo-extra";
      extra.getBoundingClientRect = () => fakeRect(200, 150, 40, 20);
      document.body.append(extra);

      const tour = createTour({
        steps: [{ content: "x", highlight: ["#solo-extra"], disableInteraction: true }],
      });
      await tour.start();

      expect(document.querySelectorAll(".tk-interaction-guard")).toHaveLength(1);

      tour.destroy();
      extra.remove();
    });

    it("treats a target hidden after start as missing: the step floats", async () => {
      const dyn = document.createElement("div");
      dyn.id = "hide-me";
      let rect = fakeRect(100, 50, 40, 20);
      dyn.getBoundingClientRect = () => rect;
      document.body.append(dyn);

      const tour = createTour({ steps: [{ target: "#hide-me", content: "x" }] });
      await tour.start();

      let d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
      expect(d).toContain("M100 42"); // spotlight anchored to the visible rect

      rect = fakeRect(0, 0, 0, 0); // display: none reports a zero rect
      tour.refresh();

      d = document.querySelector(".tk-overlay__path")!.getAttribute("d")!;
      expect(d).not.toContain("M100 42");
      // The cutout collapses to the viewport center (floating step).
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      expect(d).toContain(`M${vw / 2} ${vh / 2}`);
      expect(document.querySelector(".tk-tooltip")!.classList.contains("tk-tooltip--center")).toBe(
        true
      );

      tour.destroy();
      dyn.remove();
    });
  });

  describe("setOptions step source on an active tour", () => {
    it("programmatic steps from the patch win over a previous data-attribute scan", async () => {
      target.setAttribute("data-tour", "From the DOM");
      const tour = createTour(); // starts in declarative mode
      await tour.start();
      expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("From the DOM");

      tour.setOptions({ steps: [{ content: "Programmatic now" }] });
      await vi.waitFor(() =>
        expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("Programmatic now")
      );
      expect(tour.steps).toHaveLength(1);

      tour.destroy();
    });

    it("force-exits when the patch leaves nothing to show", async () => {
      const tour = createTour({ steps: [{ content: "one" }, { content: "two" }] });
      await tour.start();

      // No [data-tour] in the DOM, so an empty steps patch resolves to nothing.
      tour.setOptions({ steps: [] });

      await vi.waitFor(() => expect(tour.isActive).toBe(false), { timeout: 2000 });
      await vi.waitFor(() => expect(document.querySelector(".tk-root")).toBeNull(), {
        timeout: 2000,
      });
    });

    it("empty steps patch falls back to a fresh data-attribute scan", async () => {
      const tour = createTour({ steps: [{ content: "programmatic" }] });
      await tour.start();

      target.setAttribute("data-tour", "Declarative again");
      tour.setOptions({ steps: [] });
      await vi.waitFor(() =>
        expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe(
          "Declarative again"
        )
      );

      tour.destroy();
    });
  });

  describe("setOptions on an active tour", () => {
    it("re-applies theme, zIndex and labels to mounted components", async () => {
      const tour = createTour({ steps: [{ content: "one" }, { content: "two" }] });
      await tour.start();

      tour.setOptions({ theme: "dark", zIndex: 12345, labels: { next: "Weiter" } });
      await vi.waitFor(() => {
        expect(document.querySelector<HTMLButtonElement>(".tk-button--primary")!.textContent).toBe(
          "Weiter"
        );
      });

      const root = document.querySelector<HTMLElement>(".tk-root")!;
      expect(root.dataset["tkTheme"]).toBe("dark");
      expect(root.style.getPropertyValue("--tk-z")).toBe("12345");

      tour.destroy();
    });

    it("updates overlay opacity and clickToExit live", async () => {
      const tour = createTour({ steps: [{ content: "x" }] });
      await tour.start();

      tour.setOptions({ overlay: { opacity: 0.9, clickToExit: false } });

      const overlay = document.querySelector<SVGSVGElement>(".tk-overlay")!;
      expect(overlay.style.getPropertyValue("--tk-overlay-opacity")).toBe("0.9");

      const path = document.querySelector<SVGPathElement>(".tk-overlay__path")!;
      path.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
      expect(tour.isActive).toBe(true); // clickToExit off → the click is ignored

      tour.destroy();
    });

    it("enables keyboard navigation even when no listener was bound at mount", async () => {
      const tour = createTour({
        keyboard: false,
        exitOnEsc: false,
        steps: [{ content: "one" }, { content: "two" }],
      });
      await tour.start();

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await flush();
      expect(tour.index).toBe(0); // keyboard off

      tour.setOptions({ keyboard: true });
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await vi.waitFor(() => expect(tour.index).toBe(1));

      tour.destroy();
    });
  });
});
