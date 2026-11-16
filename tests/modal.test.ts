import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour, type Tour } from "../src/tour/tour";

describe("modal mode", () => {
  let app: HTMLDivElement;
  let aside: HTMLDivElement;
  let tour: Tour | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    app = document.createElement("div");
    app.id = "app";
    aside = document.createElement("div");
    aside.id = "aside";
    document.body.append(app, aside);
  });

  afterEach(() => {
    tour?.destroy();
    tour = null;
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("marks the dialog aria-modal and inerts the host page, restoring on destroy", async () => {
    tour = createTour({ modal: true, steps: [{ content: "x" }] });
    await tour.start();

    expect(document.querySelector(".tk-tooltip")!.getAttribute("aria-modal")).toBe("true");
    expect(app.hasAttribute("inert")).toBe(true);
    expect(aside.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".tk-root")!.hasAttribute("inert")).toBe(false);

    tour.destroy();
    tour = null;
    expect(app.hasAttribute("inert")).toBe(false);
    expect(aside.hasAttribute("inert")).toBe(false);
  });

  it("keeps a pre-existing inert attribute on restore", async () => {
    aside.setAttribute("inert", "");

    tour = createTour({ modal: true, steps: [{ content: "x" }] });
    await tour.start();
    expect(aside.hasAttribute("inert")).toBe(true);

    await tour.exit(true);
    await vi.waitFor(() => expect(document.querySelector(".tk-root")).toBeNull());
    expect(aside.hasAttribute("inert")).toBe(true); // was inert before the tour
    expect(app.hasAttribute("inert")).toBe(false);
    tour = null;
  });

  it("toggles modal live via setOptions", async () => {
    tour = createTour({ steps: [{ content: "x" }] });
    await tour.start();
    expect(app.hasAttribute("inert")).toBe(false);

    tour.setOptions({ modal: true });
    expect(app.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".tk-tooltip")!.getAttribute("aria-modal")).toBe("true");

    tour.setOptions({ modal: false });
    expect(app.hasAttribute("inert")).toBe(false);
    expect(document.querySelector(".tk-tooltip")!.hasAttribute("aria-modal")).toBe(false);
  });

  it("keeps the target out of the Tab cycle (inert host cannot take focus)", async () => {
    const offsetSpy = vi
      .spyOn(HTMLElement.prototype, "offsetParent", "get")
      .mockReturnValue(document.body);

    const targetBtn = document.createElement("button");
    targetBtn.id = "modal-target";
    app.append(targetBtn);

    tour = createTour({ modal: true, steps: [{ target: "#modal-target", content: "x" }] });
    await tour.start();
    await new Promise((r) => setTimeout(r, 0));

    const pressTab = () =>
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      );

    const seen = new Set<Element>();
    for (let i = 0; i < 5; i++) {
      pressTab();
      if (document.activeElement) seen.add(document.activeElement);
    }
    expect(seen.has(targetBtn)).toBe(false);

    offsetSpy.mockRestore();
  });
});

describe("tour.complete()", () => {
  afterEach(() => {
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("finishes the tour programmatically from any step", async () => {
    const order: string[] = [];
    const tour = createTour({ steps: [{ content: "one" }, { content: "two" }] });
    tour.on("beforeExit", () => {
      order.push("beforeExit");
    });
    tour.on("complete", ({ reason }) => {
      order.push(`complete:${reason}`);
    });
    tour.on("exit", () => {
      order.push("exit");
    });

    await tour.start();
    expect(await tour.complete()).toBe(true);
    expect(order).toEqual(["beforeExit", "complete:finished", "exit"]);
    expect(tour.isActive).toBe(false);
  });

  it("is cancellable by the beforeExit guard and no-ops when inactive", async () => {
    const complete = vi.fn();
    const tour = createTour({ steps: [{ content: "one" }] });
    tour.on("complete", complete);

    expect(await tour.complete()).toBe(false); // inactive

    await tour.start();
    const off = tour.on("beforeExit", (e) => e.cancel());
    expect(await tour.complete()).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(tour.isActive).toBe(true);

    off();
    expect(await tour.complete()).toBe(true);
    expect(complete).toHaveBeenCalledWith({ reason: "finished" });
    tour.destroy();
  });

  it("marks showOnce as seen", async () => {
    localStorage.clear();
    const tour = createTour({
      showOnce: { key: "tour:complete-test" },
      steps: [{ content: "one" }],
    });
    await tour.start();
    await tour.complete();

    expect(localStorage.getItem("tour:complete-test")).toMatch(/^\{"v":1,"t":\d+\}$/);
    expect(await tour.start()).toBe(false); // already seen
    localStorage.removeItem("tour:complete-test");
  });
});
