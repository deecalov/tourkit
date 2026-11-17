import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { highlight, type Highlight } from "../src/tour/highlight";

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

const overlayPath = () => document.querySelector(".tk-overlay__path")!.getAttribute("d")!;

describe("highlight()", () => {
  let target: HTMLDivElement;
  let h: Highlight | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("div");
    target.id = "spot";
    target.getBoundingClientRect = () => fakeRect(100, 50, 40, 20);
    document.body.append(target);
  });

  afterEach(() => {
    h?.destroy();
    h = null;
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("mounts a spotlight-only root with the cutout at the target rect", () => {
    h = highlight("#spot");

    const root = document.querySelector(".tk-root.tk-highlight")!;
    expect(root).not.toBeNull();
    expect(root.querySelector(".tk-overlay")).not.toBeNull();
    expect(root.querySelector(".tk-tooltip")).toBeNull(); // no tooltip layer
    // Stage = rect inflated by the default padding 8 → M(x + radius) y.
    expect(overlayPath()).toContain("M100 42");
    expect(h.isActive).toBe(true);
  });

  it("an explicit undefined overlay option falls back to the default", () => {
    h = highlight("#spot", { overlay: { padding: undefined, radius: undefined } });

    expect(overlayPath()).not.toContain("NaN");
    expect(overlayPath()).toContain("M100 42"); // default padding 8, radius 8
  });

  it("move() re-targets the spotlight", () => {
    const other = document.createElement("div");
    other.id = "other";
    other.getBoundingClientRect = () => fakeRect(300, 200, 60, 30);
    document.body.append(other);

    h = highlight("#spot", { overlay: { transitionMs: 0 } });
    h.move("#other");

    expect(overlayPath()).toContain("M300 192");
  });

  it("refresh() re-reads geometry", () => {
    let rect = fakeRect(100, 50, 40, 20);
    target.getBoundingClientRect = () => rect;

    h = highlight("#spot");
    rect = fakeRect(140, 90, 40, 20);
    h.refresh();

    expect(overlayPath()).toContain("M140 82");
  });

  it("refresh() re-resolves a selector after the node is replaced", () => {
    // The SPA case: the screen re-renders and the old node is gone. refresh()
    // must find the replacement without scrolling anywhere.
    h = highlight("#spot");
    const scrollIntoView = vi.fn();

    target.remove();
    const replacement = document.createElement("div");
    replacement.id = "spot";
    replacement.getBoundingClientRect = () => fakeRect(220, 160, 40, 20);
    replacement.scrollIntoView = scrollIntoView;
    document.body.append(replacement);

    h.refresh();

    expect(overlayPath()).toContain("M220 152");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("move() scrolls to the new target, move({ scroll: false }) does not", () => {
    const other = document.createElement("div");
    other.id = "other";
    other.getBoundingClientRect = () => fakeRect(300, 4000, 60, 30);
    const scrollIntoView = vi.fn();
    other.scrollIntoView = scrollIntoView;
    document.body.append(other);

    h = highlight("#spot", { overlay: { transitionMs: 0 } });

    h.move("#other");
    expect(scrollIntoView).toHaveBeenCalledOnce();

    h.move("#other", { scroll: false });
    expect(scrollIntoView).toHaveBeenCalledOnce(); // still just the first move
    expect(overlayPath()).toContain("M300 3992");
  });

  it("Escape dismisses by default; exitOnEsc: false keeps it", () => {
    h = highlight("#spot");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".tk-highlight")).toBeNull();
    expect(h.isActive).toBe(false);

    h = highlight("#spot", { exitOnEsc: false });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".tk-highlight")).not.toBeNull();
  });

  it("backdrop click dismisses via overlay.clickToExit", () => {
    h = highlight("#spot");
    document
      .querySelector(".tk-overlay__path")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".tk-highlight")).toBeNull();

    h = highlight("#spot", { overlay: { clickToExit: false } });
    document
      .querySelector(".tk-overlay__path")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".tk-highlight")).not.toBeNull();
  });

  it("collapses the cutout for a missing target instead of crashing", () => {
    h = highlight("#nope");
    expect(document.querySelector(".tk-highlight")).not.toBeNull();
    expect(overlayPath()).toContain("h0v0h0Z"); // degenerate centered cutout
  });

  it("applies theme and zIndex to its root", () => {
    h = highlight("#spot", { theme: "dark", zIndex: 4242 });
    const root = document.querySelector<HTMLElement>(".tk-highlight")!;
    expect(root.dataset["tkTheme"]).toBe("dark");
    expect(root.style.getPropertyValue("--tk-z")).toBe("4242");
  });

  it("destroy() is idempotent and removes listeners", () => {
    h = highlight("#spot");
    h.destroy();
    h.destroy(); // second call is a no-op
    expect(document.querySelector(".tk-highlight")).toBeNull();
  });
});
