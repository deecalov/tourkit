import { afterEach, describe, expect, it, vi } from "vitest";
import { css, injectStyles } from "../src/styles/inject";

describe("injectStyles", () => {
  afterEach(() => {
    document.querySelectorAll("style[data-tk-styles]").forEach((el) => el.remove());
    vi.unstubAllGlobals();
  });

  it("exports the stylesheet string", () => {
    expect(css).toContain(".tk-root");
    expect(css).toContain(".tk-tooltip");
  });

  it("falls back to a <style> element and honors the nonce (jsdom path)", () => {
    const cleanup = injectStyles({ nonce: "abc123" });

    const style = document.head.querySelector<HTMLStyleElement>("style[data-tk-styles]")!;
    expect(style).not.toBeNull();
    expect(style.textContent).toContain(".tk-root");
    expect(style.nonce).toBe("abc123");

    cleanup();
    expect(document.head.querySelector("style[data-tk-styles]")).toBeNull();
  });

  it("is idempotent per target: repeated calls return the same cleanup", () => {
    const first = injectStyles();
    const second = injectStyles();

    expect(second).toBe(first);
    expect(document.querySelectorAll("style[data-tk-styles]")).toHaveLength(1);

    first();
    // After cleanup a fresh injection works again.
    const third = injectStyles();
    expect(third).not.toBe(first);
    expect(document.querySelectorAll("style[data-tk-styles]")).toHaveLength(1);
    third();
  });

  it("injects into a shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });

    const cleanup = injectStyles({ target: shadow });
    expect(shadow.querySelector("style[data-tk-styles]")).not.toBeNull();

    cleanup();
    expect(shadow.querySelector("style[data-tk-styles]")).toBeNull();
    host.remove();
  });

  it("prefers constructable stylesheets when supported", () => {
    class FakeSheet {
      cssText = "";
      replaceSync(text: string) {
        this.cssText = text;
      }
    }
    vi.stubGlobal("CSSStyleSheet", FakeSheet);
    const adopted: unknown[] = [];
    Object.defineProperty(document, "adoptedStyleSheets", {
      configurable: true,
      get: () => adopted.slice(),
      set: (value: unknown[]) => {
        adopted.length = 0;
        adopted.push(...value);
      },
    });

    try {
      const cleanup = injectStyles();
      expect(adopted).toHaveLength(1);
      expect((adopted[0] as InstanceType<typeof FakeSheet>).cssText).toContain(".tk-root");
      expect(document.head.querySelector("style[data-tk-styles]")).toBeNull();

      cleanup();
      expect(adopted).toHaveLength(0);
    } finally {
      delete (document as unknown as Record<string, unknown>)["adoptedStyleSheets"];
    }
  });
});
