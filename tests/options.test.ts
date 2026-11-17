// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  formatLabel,
  getDefaultOptions,
  mergeOptions,
  resolveWaitForTarget,
} from "../src/core/options";

describe("options", () => {
  it("provides sane defaults", () => {
    const o = getDefaultOptions();

    expect(o.placement).toBe("bottom");
    expect(o.allowHTML).toBe(false);
    expect(o.overlay.opacity).toBe(0.5);
    expect(o.buttons.doneOnLast).toBe(true);
    expect(o.placementPrecedence).toEqual(["bottom", "top", "right", "left"]);
  });

  it("merges nested objects one level deep", () => {
    const merged = mergeOptions(getDefaultOptions(), {
      overlay: { opacity: 0.8 },
      labels: { next: "Continue" },
    });

    expect(merged.overlay.opacity).toBe(0.8);
    expect(merged.overlay.padding).toBe(8); // untouched sibling survives
    expect(merged.labels.next).toBe("Continue");
    expect(merged.labels.back).toBe("Back");
  });

  it("an explicit undefined does not erase an option that has a default", () => {
    // Wrappers forward unset props verbatim: `{ placement: props.placement }`.
    const merged = mergeOptions(getDefaultOptions(), {
      steps: undefined,
      placement: undefined,
      keyboard: undefined,
      labels: { next: undefined, back: "Prev" },
      buttons: { next: undefined },
      overlay: { padding: undefined },
      scroll: { block: undefined },
      waitForTarget: { timeoutMs: undefined },
    });

    expect(merged.steps).toEqual([]);
    expect(merged.placement).toBe("bottom");
    expect(merged.keyboard).toBe(true);
    expect(merged.labels.next).toBe("Next");
    expect(merged.labels.back).toBe("Prev");
    expect(merged.buttons.next).toBe(true);
    expect(merged.overlay.padding).toBe(8);
    expect(merged.scroll.block).toBe("center");
    expect(merged.waitForTarget).toEqual({ timeoutMs: 10000, onTimeout: "float" });
  });

  it("undefined still clears an optional option (setOptions({ theme: undefined }))", () => {
    const themed = mergeOptions(getDefaultOptions(), { theme: "dark", zIndex: 5 });
    const cleared = mergeOptions(themed, { theme: undefined, zIndex: undefined });

    expect(cleared.theme).toBeUndefined();
    expect(cleared.zIndex).toBeUndefined();
  });

  it("does not mutate the base options", () => {
    const base = getDefaultOptions();
    mergeOptions(base, { overlay: { opacity: 0.9 } });

    expect(base.overlay.opacity).toBe(0.5);
  });

  it("formats label templates", () => {
    expect(formatLabel("{step} of {total}", 3, 7)).toBe("3 of 7");
    expect(formatLabel("Step {step} out of {total}", 1, 2)).toBe("Step 1 out of 2");
  });

  describe("waitForTarget resolution", () => {
    it("defaults to watching with a 10s float timeout", () => {
      expect(getDefaultOptions().waitForTarget).toEqual({ timeoutMs: 10000, onTimeout: "float" });
    });

    it("merges partial patches over the base and keeps false as off", () => {
      const base = { timeoutMs: 5000, onTimeout: "float" } as const;
      expect(resolveWaitForTarget(base, { onTimeout: "skip" })).toEqual({
        timeoutMs: 5000,
        onTimeout: "skip",
      });
      expect(resolveWaitForTarget(base, false)).toBe(false);
      expect(resolveWaitForTarget(false, undefined)).toBe(false);
      // A partial override on a disabled base falls back to the defaults.
      expect(resolveWaitForTarget(false, { timeoutMs: 100 })).toEqual({
        timeoutMs: 100,
        onTimeout: "float",
      });
    });

    it("mergeOptions treats waitForTarget: false and partials correctly", () => {
      const off = mergeOptions(getDefaultOptions(), { waitForTarget: false });
      expect(off.waitForTarget).toBe(false);

      const patched = mergeOptions(getDefaultOptions(), { waitForTarget: { timeoutMs: 500 } });
      expect(patched.waitForTarget).toEqual({ timeoutMs: 500, onTimeout: "float" });
    });
  });
});
