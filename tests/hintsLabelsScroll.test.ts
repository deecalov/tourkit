import { beforeEach, describe, expect, it, vi } from "vitest";
import * as locales from "../src/locales";
import { defaultLabels } from "../src/core/options";
import { fakeRect, mountHints, withRect } from "./helpers";

const popoverButton = () => document.querySelector(".tk-hint-popover__button")?.textContent;

const target = (id = "hint-target"): HTMLElement => {
  const el = document.createElement("button");
  el.id = id;
  document.body.append(el);
  return el;
};

describe("hint labels", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("falls back to the built-in English label", () => {
    target();
    mountHints({ hints: [{ target: "#hint-target", content: "x" }] })
      .render()
      .open(0);

    expect(popoverButton()).toBe("Got it");
  });

  it("takes hintDismiss from a locale, like tours take their labels", () => {
    target();
    mountHints({ labels: locales.ru, hints: [{ target: "#hint-target", content: "x" }] })
      .render()
      .open(0);

    expect(popoverButton()).toBe("Понятно");
  });

  it("lets popover.buttonLabel win over the locale (pre-0.7 configs)", () => {
    target();
    mountHints({
      labels: locales.de,
      popover: { buttonLabel: "Alles klar!" },
      hints: [{ target: "#hint-target", content: "x" }],
    })
      .render()
      .open(0);

    expect(popoverButton()).toBe("Alles klar!");
  });

  it("every bundled locale translates the dismiss button", () => {
    for (const [name, labels] of Object.entries(locales)) {
      expect(labels.hintDismiss, `${name}.hintDismiss`).toBeTruthy();
      expect(labels.hintDismiss, `${name}.hintDismiss`).not.toBe(defaultLabels.hintDismiss);
    }
  });
});

describe("hints scroll on open", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not scroll by default: a mouse click must not move the page", () => {
    const el = target();
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    withRect(el, fakeRect(10, 40, 30, 20));

    mountHints({ hints: [{ target: "#hint-target", content: "x" }] })
      .render()
      .open(0);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("brings an off-screen marker into view when asked per call", () => {
    const el = target();
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    // Far below the fold: the popover would otherwise open outside the viewport.
    withRect(el, fakeRect(10, 4000, 30, 20));

    mountHints({ hints: [{ target: "#hint-target", content: "x" }] })
      .render()
      .open(0, { scroll: true });

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("an instance-level scroll policy applies to every open", () => {
    const el = target();
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    withRect(el, fakeRect(10, 4000, 30, 20));

    const hints = mountHints({
      scroll: { block: "center" },
      hints: [{ target: "#hint-target", content: "x" }],
    }).render();

    hints.open(0);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));

    // ...and a per-call opt-out still wins.
    hints.close();
    hints.open(0, { scroll: false });
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });
});
