// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getDefaultOptions, mergeOptions } from "../src/core/options";
import type { Labels } from "../src/core/types";
import * as locales from "../src/locales";

const REQUIRED_KEYS: Array<keyof Labels> = [
  "next",
  "back",
  "done",
  "skip",
  "stepOf",
  "stepAnnouncement",
  "dontShowAgain",
];

describe("locales", () => {
  it("every locale provides the complete Labels shape", () => {
    for (const [name, labels] of Object.entries(locales)) {
      for (const key of REQUIRED_KEYS) {
        expect(labels[key], `${name}.${key}`).toBeTruthy();
      }
      expect(labels.stepOf).toContain("{step}");
      expect(labels.stepOf).toContain("{total}");
    }
  });

  it("plugs into tour options as a whole", () => {
    const merged = mergeOptions(getDefaultOptions(), { labels: locales.ru });
    expect(merged.labels.next).toBe("Далее");
    expect(merged.labels.dontShowAgain).toBe("Больше не показывать");
  });
});
