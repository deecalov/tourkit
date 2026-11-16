// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { version } from "../src/index";

describe("version export", () => {
  it("matches package.json (injected via the build-time define)", () => {
    // Vitest runs from the package root; import.meta.url is not a file URL
    // under the jsdom environment.
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    expect(version).toBe(pkg.version);
  });
});
