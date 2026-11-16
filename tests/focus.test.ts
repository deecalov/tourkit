import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trapFocus } from "../src/ui/focus";

const release: Array<() => void> = [];

const trap = (container: HTMLElement, extra?: () => Element | null) => {
  const stop = trapFocus(container, extra);
  release.push(stop);
  return stop;
};

const tab = (shiftKey = false) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true }));

const buttons = (host: HTMLElement, ids: string[]) => {
  for (const id of ids) {
    const button = document.createElement("button");
    button.id = id;
    button.textContent = id;
    host.append(button);
  }
};

const panel = (id: string): HTMLElement => {
  const el = document.createElement("div");
  el.id = id;
  el.tabIndex = -1;
  document.body.append(el);
  return el;
};

beforeEach(() => {
  // jsdom does no layout: offsetParent is null for everything, which the
  // visibility filter reads as "hidden". Fake a laid-out page.
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
});

afterEach(() => {
  for (const stop of release.splice(0)) stop();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("trapFocus", () => {
  it("cycles forward and wraps at the end", () => {
    const host = panel("host");
    buttons(host, ["a", "b"]);
    trap(host);

    document.getElementById("a")!.focus();
    tab();
    expect(document.activeElement?.id).toBe("b");

    tab();
    expect(document.activeElement?.id).toBe("a"); // wrapped
  });

  it("cycles backward with Shift+Tab and wraps at the start", () => {
    const host = panel("host");
    buttons(host, ["a", "b", "c"]);
    trap(host);

    document.getElementById("b")!.focus();
    tab(true);
    expect(document.activeElement?.id).toBe("a");

    tab(true);
    expect(document.activeElement?.id).toBe("c"); // wrapped backwards
  });

  it("pulls focus in from outside: Tab lands first, Shift+Tab lands last", () => {
    const host = panel("host");
    buttons(host, ["a", "b"]);
    const outside = document.createElement("button");
    outside.id = "outside";
    document.body.append(outside);
    trap(host);

    outside.focus();
    tab();
    expect(document.activeElement?.id).toBe("a");

    outside.focus();
    tab(true);
    expect(document.activeElement?.id).toBe("b");
  });

  it("keeps focus on the container when nothing inside is focusable", () => {
    const host = panel("empty");
    host.append(document.createElement("p"));
    trap(host);

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(host);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores keys other than Tab", () => {
    const host = panel("host");
    buttons(host, ["a", "b"]);
    trap(host);

    document.getElementById("a")!.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement?.id).toBe("a");
  });

  it("appends the extra root to the cycle and skips it when it is gone", () => {
    const host = panel("host");
    buttons(host, ["a"]);

    const extra = document.createElement("button");
    extra.id = "target";
    document.body.append(extra);

    let allowed: Element | null = extra;
    trap(host, () => allowed);

    document.getElementById("a")!.focus();
    tab();
    expect(document.activeElement?.id).toBe("target");

    allowed = null; // interaction disabled for this step
    document.getElementById("a")!.focus();
    tab();
    expect(document.activeElement?.id).toBe("a"); // cycle of one
  });

  it("only the topmost trap steers Tab; releasing it revives the one below", () => {
    const lower = panel("lower");
    buttons(lower, ["l1", "l2"]);
    trap(lower);

    const upper = panel("upper");
    buttons(upper, ["u1", "u2"]);
    const releaseUpper = trap(upper);

    document.getElementById("l1")!.focus();
    tab();
    // The upper trap owns Tab: focus is pulled into its own cycle.
    expect(document.activeElement?.id).toBe("u1");

    releaseUpper();
    document.getElementById("l1")!.focus();
    tab();
    expect(document.activeElement?.id).toBe("l2");
  });

  it("reaches focusables inside an open shadow root", () => {
    const host = panel("host");
    buttons(host, ["a"]);

    const widget = document.createElement("div");
    host.append(widget);
    const shadow = widget.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    inner.id = "shadow-button";
    shadow.append(inner);

    trap(host);

    document.getElementById("a")!.focus();
    tab();
    expect(shadow.activeElement).toBe(inner);

    // activeElement resolves through the host, so the cycle continues from
    // the shadow element rather than restarting at the first entry.
    tab();
    expect(document.activeElement?.id).toBe("a");
  });
});
