import { afterEach, describe, expect, it, vi } from "vitest";
import { caf, isElementHidden, prefersReducedMotion, raf, setContent } from "../src/ui/dom";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("setContent", () => {
  it("escapes by default and passes HTML through when allowed", () => {
    const el = document.createElement("div");

    setContent(el, "<b>hi</b>", false);
    expect(el.querySelector("b")).toBeNull();
    expect(el.textContent).toBe("<b>hi</b>");

    setContent(el, "<b>hi</b>", true);
    expect(el.querySelector("b")).not.toBeNull();
  });

  it("runs the sanitizer before inserting HTML", () => {
    const el = document.createElement("div");
    const sanitize = vi.fn((html: string) => html.replace(/<script>.*<\/script>/, ""));

    setContent(el, "<p>safe</p><script>evil()</script>", true, sanitize);

    expect(sanitize).toHaveBeenCalledOnce();
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("p")?.textContent).toBe("safe");
  });

  it("ignores the sanitizer while allowHTML is off", () => {
    const el = document.createElement("div");
    const sanitize = vi.fn((html: string) => html);

    setContent(el, "<b>x</b>", false, sanitize);

    expect(sanitize).not.toHaveBeenCalled();
    expect(el.textContent).toBe("<b>x</b>");
  });
});

describe("prefersReducedMotion", () => {
  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("follows the media query result", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("isElementHidden", () => {
  it("delegates to checkVisibility when the browser has it", () => {
    const el = document.createElement("div");
    el.checkVisibility = () => false;
    expect(isElementHidden(el)).toBe(true);

    el.checkVisibility = () => true;
    expect(isElementHidden(el)).toBe(false);
  });

  it("falls back to computed styles on older engines", () => {
    const el = document.createElement("div");
    document.body.append(el);
    // Simulate an engine without checkVisibility.
    (el as { checkVisibility?: unknown }).checkVisibility = undefined;

    expect(isElementHidden(el)).toBe(false);

    el.style.display = "none";
    expect(isElementHidden(el)).toBe(true);

    el.style.display = "";
    el.style.visibility = "hidden";
    expect(isElementHidden(el)).toBe(true);
  });
});

describe("raf/caf fallback", () => {
  it("uses requestAnimationFrame when present", async () => {
    const spy = vi.fn();
    raf(spy);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to a timer and still passes a timestamp", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const spy = vi.fn();

    raf(spy);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(spy).toHaveBeenCalledWith(expect.any(Number));
  });

  it("cancels a fallback frame through caf", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.stubGlobal("cancelAnimationFrame", undefined);
    const spy = vi.fn();

    caf(raf(spy));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(spy).not.toHaveBeenCalled();
  });
});
