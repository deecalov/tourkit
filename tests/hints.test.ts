import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHints, fromHintAttributes, markerAnchorPoint } from "../src/hints";

describe("markerAnchorPoint", () => {
  const rect = { x: 100, y: 200, width: 80, height: 40 };

  it("computes the nine anchors", () => {
    expect(markerAnchorPoint(rect, "top-start", false)).toEqual({ x: 100, y: 200 });
    expect(markerAnchorPoint(rect, "middle-center", false)).toEqual({ x: 140, y: 220 });
    expect(markerAnchorPoint(rect, "bottom-end", false)).toEqual({ x: 180, y: 240 });
  });

  it("mirrors start/end in RTL", () => {
    expect(markerAnchorPoint(rect, "top-start", true)).toEqual({ x: 180, y: 200 });
    expect(markerAnchorPoint(rect, "top-end", true)).toEqual({ x: 100, y: 200 });
    expect(markerAnchorPoint(rect, "top-center", true)).toEqual({ x: 140, y: 200 });
  });
});

describe("fromHintAttributes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects hints with attributes", () => {
    const el = document.createElement("button");
    el.setAttribute("data-hint", "Export to Excel");
    el.setAttribute("data-hint-position", "top-end");
    el.setAttribute("data-hint-placement", "left");
    el.setAttribute("data-hint-id", "export");
    document.body.append(el);

    const hidden = document.createElement("div");
    hidden.setAttribute("data-hint", "hidden");
    hidden.style.display = "none";
    document.body.append(hidden);

    const hints = fromHintAttributes();

    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      target: el,
      content: "Export to Excel",
      markerPosition: "top-end",
      placement: "left",
      id: "export",
    });
  });

  it("skips visibility:hidden elements", () => {
    const ghost = document.createElement("button");
    ghost.setAttribute("data-hint", "ghost");
    ghost.style.visibility = "hidden";
    document.body.append(ghost);

    expect(fromHintAttributes()).toHaveLength(0);
  });
});

describe("createHints", () => {
  let target: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    target = document.createElement("button");
    target.id = "hint-target";
    document.body.append(target);
  });

  const make = (extra = {}) =>
    createHints({ hints: [{ target: "#hint-target", content: "Try me", id: "h1" }], ...extra });

  it("renders a marker and toggles the popover on click", async () => {
    const hints = make();
    const opened = vi.fn();
    hints.on("open", opened);
    hints.render();

    const marker = document.querySelector<HTMLButtonElement>(".tk-hint")!;
    expect(marker).not.toBeNull();
    expect(marker.getAttribute("aria-label")).toBe("Try me");

    marker.click();
    await vi.waitFor(() => expect(document.querySelector(".tk-hint-popover")).not.toBeNull());
    expect(marker.getAttribute("aria-expanded")).toBe("true");
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));

    marker.click(); // toggle
    expect(document.querySelector(".tk-hint-popover")).toBeNull();

    hints.destroy();
  });

  it("dismiss hides the marker, emits the event and persists ids", async () => {
    const hints = make({ rememberDismissed: { key: "hints:test" } });
    const dismissed = vi.fn();
    hints.on("dismiss", dismissed);
    hints.render();

    hints.open(0);
    document.querySelector<HTMLButtonElement>(".tk-hint-popover__button")!.click();

    expect(dismissed).toHaveBeenCalled();
    expect(document.querySelector(".tk-hint")!.classList.contains("tk-hint--hidden")).toBe(true);
    expect(JSON.parse(localStorage.getItem("hints:test")!)).toEqual(["h1"]);

    hints.destroy();

    // A fresh instance stays dismissed thanks to persistence.
    const again = make({ rememberDismissed: { key: "hints:test" } });
    again.render();
    expect(document.querySelector(".tk-hint")!.classList.contains("tk-hint--hidden")).toBe(true);
    again.destroy();
  });

  it("show/hide/hideAll control marker visibility without persistence", () => {
    const hints = make();
    hints.render();

    hints.hide(0);
    expect(document.querySelector(".tk-hint")!.classList.contains("tk-hint--hidden")).toBe(true);

    hints.show(0);
    expect(document.querySelector(".tk-hint")!.classList.contains("tk-hint--hidden")).toBe(false);

    hints.hideAll();
    expect(document.querySelector(".tk-hint")!.classList.contains("tk-hint--hidden")).toBe(true);

    hints.destroy();
  });

  it("show() after dismiss() revives the hint: marker works and persistence is cleared", async () => {
    const hints = make({ rememberDismissed: { key: "hints:revive" } });
    hints.render();

    hints.dismiss(0);
    expect(document.querySelector(".tk-hint")!.classList.contains("tk-hint--hidden")).toBe(true);
    expect(JSON.parse(localStorage.getItem("hints:revive")!)).toEqual(["h1"]);

    hints.show(0);
    expect(document.querySelector(".tk-hint")!.classList.contains("tk-hint--hidden")).toBe(false);
    expect(JSON.parse(localStorage.getItem("hints:revive")!)).toEqual([]);

    // The revived marker must actually open its popover again.
    hints.open(0);
    expect(document.querySelector(".tk-hint-popover")).not.toBeNull();

    hints.destroy();
  });

  it("persistDismissed keeps foreign ids stored under a shared key", () => {
    localStorage.setItem("hints:shared", JSON.stringify(["other-page-hint"]));

    const hints = make({ rememberDismissed: { key: "hints:shared" } });
    hints.render();
    hints.dismiss(0);

    expect(new Set(JSON.parse(localStorage.getItem("hints:shared")!))).toEqual(
      new Set(["other-page-hint", "h1"])
    );

    hints.destroy();
  });

  it("closes the popover on Escape and outside click", async () => {
    const hints = make();
    hints.render();
    hints.open(0);
    expect(document.querySelector(".tk-hint-popover")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".tk-hint-popover")).toBeNull();

    hints.open(0);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".tk-hint-popover")).toBeNull();

    hints.destroy();
  });

  it("hides the marker while its target reports a zero rect (hidden) and restores it", () => {
    const visible = { x: 10, y: 20, width: 30, height: 40 };
    let current = visible;
    target.getBoundingClientRect = () =>
      ({
        ...current,
        top: current.y,
        left: current.x,
        right: current.x + current.width,
        bottom: current.y + current.height,
        toJSON: () => ({}),
      }) as DOMRect;

    const hints = make();
    hints.render();

    const marker = document.querySelector<HTMLElement>(".tk-hint")!;
    expect(marker.style.display).toBe("");

    current = { x: 0, y: 0, width: 0, height: 0 }; // display: none reports a zero rect
    hints.refresh();
    expect(marker.style.display).toBe("none");

    current = visible;
    hints.refresh();
    expect(marker.style.display).toBe("");

    hints.destroy();
  });

  it("add() renders a marker at runtime and its popover opens at the right index", async () => {
    const second = document.createElement("button");
    second.id = "second-target";
    document.body.append(second);

    const hints = make();
    hints.render();

    const index = hints.add({ target: "#second-target", content: "Added later", id: "h2" });
    expect(index).toBe(1);
    expect(document.querySelectorAll(".tk-hint")).toHaveLength(2);

    const markers = document.querySelectorAll<HTMLButtonElement>(".tk-hint");
    expect(markers[1]!.getAttribute("data-hint-index")).toBe("1");

    markers[1]!.click();
    await vi.waitFor(() => expect(document.querySelector(".tk-hint-popover")).not.toBeNull());
    expect(document.querySelector(".tk-hint-popover__content")!.textContent).toBe("Added later");

    hints.destroy();
    second.remove();
  });

  it("add() before render() mounts the instance first", () => {
    const hints = createHints({ hints: [{ target: "#hint-target", content: "cfg", id: "h1" }] });
    const index = hints.add({ target: "#hint-target", content: "dynamic", id: "dyn" });

    expect(index).toBe(1);
    expect(document.querySelectorAll(".tk-hint")).toHaveLength(2);
    hints.destroy();
  });

  it("add() respects a persisted dismissal for the same id", () => {
    localStorage.setItem("hints:dyn", JSON.stringify(["dyn-hidden"]));

    const hints = make({ rememberDismissed: { key: "hints:dyn" } });
    hints.render();
    hints.add({ target: "#hint-target", content: "was dismissed", id: "dyn-hidden" });

    const markers = document.querySelectorAll<HTMLButtonElement>(".tk-hint");
    expect(markers[1]!.classList.contains("tk-hint--hidden")).toBe(true);

    hints.destroy();
  });

  it("remove() by id closes the open popover and resyncs indexes", async () => {
    const second = document.createElement("button");
    second.id = "second-target";
    document.body.append(second);

    const hints = createHints({
      hints: [
        { target: "#hint-target", content: "first", id: "a" },
        { target: "#second-target", content: "second", id: "b" },
      ],
    });
    hints.render();

    hints.open(0);
    expect(document.querySelector(".tk-hint-popover")).not.toBeNull();

    hints.remove("a");
    expect(document.querySelector(".tk-hint-popover")).toBeNull();
    expect(hints.hints).toHaveLength(1);

    const markers = document.querySelectorAll<HTMLButtonElement>(".tk-hint");
    expect(markers).toHaveLength(1);
    expect(markers[0]!.getAttribute("data-hint-index")).toBe("0");

    // The remaining marker still opens its own popover (index shifted left).
    markers[0]!.click();
    await vi.waitFor(() => expect(document.querySelector(".tk-hint-popover")).not.toBeNull());
    expect(document.querySelector(".tk-hint-popover__content")!.textContent).toBe("second");

    hints.destroy();
    second.remove();
  });

  it("remove() of an unknown ref is a no-op", () => {
    const hints = make();
    hints.render();
    hints.remove("missing");
    hints.remove(42);
    expect(hints.hints).toHaveLength(1);
    hints.destroy();
  });

  it("destroy removes everything", () => {
    const hints = make();
    hints.render();
    hints.destroy();
    expect(document.querySelector(".tk-hints")).toBeNull();
  });

  it("rejects unknown event names at compile time", () => {
    const hints = make();
    // @ts-expect-error -- typo'd event names must not typecheck
    hints.on("opne", () => {});
    hints.destroy();
  });
});
