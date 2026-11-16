import { beforeEach, describe, expect, it, vi } from "vitest";
import { introJs } from "../src/compat/introjs";
import { fakeRect, withRect } from "./helpers";

/**
 * The intro.js hints facade (`introJs.hint()`), which the native suite does
 * not touch at all: payload shapes and method names are the whole contract
 * migrating code relies on.
 */
const markup = () => {
  document.body.innerHTML = `
    <div id="a" data-hint="First hint" data-hint-id="first" data-hint-position="top-left"></div>
    <div id="b" data-hint="Second hint" data-hint-id="second"></div>
  `;
};

const markers = () => document.querySelectorAll<HTMLElement>(".tk-hint");

describe("introJs.hint()", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  it("addHints() renders markers from data-hint attributes and fires onhintsadded", () => {
    markup();
    const added = vi.fn();

    const hints = introJs.hint().onhintsadded(added).addHints();

    expect(markers()).toHaveLength(2);
    expect(added).toHaveBeenCalledOnce();

    hints.removeHints();
  });

  it("is idempotent: a second addHints() does not double the markers", () => {
    markup();
    const hints = introJs.hint().addHints();
    hints.addHints();

    expect(markers()).toHaveLength(2);
    hints.removeHints();
  });

  it("render() is an alias of addHints()", () => {
    markup();
    const hints = introJs.hint();
    hints.render();

    expect(markers()).toHaveLength(2);
    hints.removeHints();
  });

  it("showHintDialog() opens a popover and onhintclick reports element, hint and index", () => {
    markup();
    const clicked = vi.fn();
    const hints = introJs.hint().onhintclick(clicked).addHints();

    hints.showHintDialog(1);

    expect(document.querySelector(".tk-hint-popover__content")?.textContent).toBe("Second hint");
    expect(clicked).toHaveBeenCalledWith(
      document.getElementById("b"),
      expect.objectContaining({ id: "second" }),
      1
    );

    hints.removeHints();
  });

  it("hideHint() hides the marker and reports it through onhintclose", () => {
    markup();
    const closed = vi.fn();
    const hints = introJs.hint().onhintclose(closed).addHints();

    hints.hideHint(0);

    expect(markers()[0]!.classList.contains("tk-hint--hidden")).toBe(true);
    expect(closed).toHaveBeenCalledWith(0);

    hints.removeHints();
  });

  it("hideHints() hides every marker, showHints() brings them back", () => {
    markup();
    const hints = introJs.hint().addHints();

    hints.hideHints();
    expect([...markers()].every((m) => m.classList.contains("tk-hint--hidden"))).toBe(true);

    hints.showHints();
    expect([...markers()].some((m) => m.classList.contains("tk-hint--hidden"))).toBe(false);

    hints.removeHints();
  });

  it("showHints() mounts the instance when it was never added", () => {
    markup();
    const hints = introJs.hint();

    hints.showHints();

    expect(markers()).toHaveLength(2);
    hints.removeHints();
  });

  it("showHint() reveals a single marker", () => {
    markup();
    const hints = introJs.hint().addHints();

    hints.hideHints();
    hints.showHint(1);

    expect(markers()[0]!.classList.contains("tk-hint--hidden")).toBe(true);
    expect(markers()[1]!.classList.contains("tk-hint--hidden")).toBe(false);

    hints.removeHints();
  });

  it("removeHint() hides one marker, removeHints() unmounts everything", () => {
    markup();
    const hints = introJs.hint().addHints();

    hints.removeHint(0);
    expect(markers()[0]!.classList.contains("tk-hint--hidden")).toBe(true);

    hints.removeHints();
    expect(document.querySelector(".tk-hints")).toBeNull();
  });

  it("destroy() is an alias of removeHints() and tolerates a second call", () => {
    markup();
    const hints = introJs.hint().addHints();

    hints.destroy();
    hints.destroy();

    expect(document.querySelector(".tk-hints")).toBeNull();
  });

  it("scopes scanning to the element it was constructed with", () => {
    document.body.innerHTML = `
      <div data-hint="outside"></div>
      <section id="scope"><div data-hint="inside"></div></section>
    `;

    const hints = introJs.hint("#scope").addHints();

    expect(markers()).toHaveLength(1);
    hints.removeHints();
  });

  it("maps intro.js marker anchors onto TourKit ones", () => {
    markup();
    // jsdom reports a zero rect for everything, which hides the marker.
    withRect(document.getElementById("a")!, fakeRect(100, 60, 40, 20));

    const hints = introJs.hint().addHints();

    // data-hint-position="top-left" anchors at the target's top-left corner,
    // unlike the "middle-end" default.
    expect(markers()[0]!.style.left).toBe("100px");
    expect(markers()[0]!.style.top).toBe("60px");

    hints.removeHints();
  });

  it("methods on an unmounted instance are no-ops", () => {
    const hints = introJs.hint();

    expect(() => {
      hints.showHint(0);
      hints.hideHint(0);
      hints.hideHints();
      hints.showHintDialog(0);
      hints.removeHint(0);
      hints.removeHints();
    }).not.toThrow();
  });
});
