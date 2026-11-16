import { beforeEach, describe, expect, it, vi } from "vitest";
import { highlight, type Highlight } from "../src/tour/highlight";
import { mountHints, mountTour } from "./helpers";

const hasClass = (name: string) => document.body.classList.contains(name);

describe("host body classes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.className = "";
  });

  it("flags the body while a tour is mounted", async () => {
    const tour = mountTour({ steps: [{ content: "one" }] });
    expect(hasClass("tk-tour-active")).toBe(false);

    await tour.start();
    expect(hasClass("tk-tour-active")).toBe(true);

    void tour.exit(true);
    await vi.waitFor(() => expect(hasClass("tk-tour-active")).toBe(false), { timeout: 2000 });
  });

  it("drops the flag on destroy()", async () => {
    const tour = mountTour({ steps: [{ content: "one" }] });
    await tour.start();

    tour.destroy();
    expect(hasClass("tk-tour-active")).toBe(false);
  });

  it("hostClasses: false leaves the body untouched", async () => {
    const tour = mountTour({ hostClasses: false, steps: [{ content: "one" }] });
    await tour.start();

    expect(hasClass("tk-tour-active")).toBe(false);
    tour.destroy();
  });

  it("setOptions toggles the flag on a running tour", async () => {
    const tour = mountTour({ hostClasses: false, steps: [{ content: "one" }] });
    await tour.start();

    tour.setOptions({ hostClasses: true });
    expect(hasClass("tk-tour-active")).toBe(true);

    tour.setOptions({ hostClasses: false });
    expect(hasClass("tk-tour-active")).toBe(false);

    tour.destroy();
  });

  it("keeps the flag while a second tour is still on screen", async () => {
    const first = mountTour({ steps: [{ content: "one" }] });
    const second = mountTour({ steps: [{ content: "two" }] });

    await first.start();
    await second.start();

    first.destroy();
    // The second tour still holds the flag: refcounting, not a plain toggle.
    expect(hasClass("tk-tour-active")).toBe(true);

    second.destroy();
    expect(hasClass("tk-tour-active")).toBe(false);
  });

  describe("highlight()", () => {
    let spot: Highlight | null = null;

    beforeEach(() => {
      const target = document.createElement("div");
      target.id = "spot";
      document.body.append(target);
      spot = null;
    });

    it("flags the body while the spotlight is up", () => {
      spot = highlight("#spot");
      expect(hasClass("tk-highlight-active")).toBe(true);

      spot.destroy();
      expect(hasClass("tk-highlight-active")).toBe(false);
    });

    it("hostClasses: false leaves the body untouched", () => {
      spot = highlight("#spot", { hostClasses: false });
      expect(hasClass("tk-highlight-active")).toBe(false);
      spot.destroy();
    });

    it("release is idempotent across repeated destroy() calls", () => {
      const first = highlight("#spot");
      const second = highlight("#spot");

      first.destroy();
      first.destroy(); // must not decrement twice
      expect(hasClass("tk-highlight-active")).toBe(true);

      second.destroy();
      expect(hasClass("tk-highlight-active")).toBe(false);
    });
  });

  describe("hints", () => {
    const mount = (hostClasses?: boolean) => {
      const target = document.createElement("button");
      target.id = "hint-target";
      document.body.append(target);

      return mountHints({
        ...(hostClasses === undefined ? {} : { hostClasses }),
        hints: [{ target: "#hint-target", content: "Explains it" }],
      }).render();
    };

    it("flags the body only while a popover is open", () => {
      const hints = mount();
      expect(hasClass("tk-hints-open")).toBe(false);

      hints.open(0);
      expect(hasClass("tk-hints-open")).toBe(true);

      hints.close();
      expect(hasClass("tk-hints-open")).toBe(false);
    });

    it("drops the flag when the instance is destroyed with a popover open", () => {
      const hints = mount();
      hints.open(0);

      hints.destroy();
      expect(hasClass("tk-hints-open")).toBe(false);
    });

    it("hostClasses: false leaves the body untouched", () => {
      const hints = mount(false);
      hints.open(0);

      expect(hasClass("tk-hints-open")).toBe(false);
    });
  });
});
