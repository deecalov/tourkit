// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The theming table is the contract hosts style against, and it was the one
 * piece of documentation an integrator had to reconstruct with grep. Keep it
 * exhaustive: a variable added to the stylesheet without a row here is
 * invisible to everyone outside this repository.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const declaredVariables = (css: string): Set<string> =>
  new Set([...css.matchAll(/^\s*(--tk-[a-z-]+)\s*:/gm)].map((match) => match[1]!));

/** Variables named in the first column of a markdown table row. */
const documentedVariables = (markdown: string): Set<string> =>
  new Set([...markdown.matchAll(/^\|\s*`(--tk-[a-z-]+)`\s*\|/gm)].map((match) => match[1]!));

describe("theming documentation", () => {
  const css = read("src/styles/styles.css");
  const doc = read("docs-site/guide/theming.md");

  it("documents every custom property the stylesheet defines", () => {
    const missing = [...declaredVariables(css)].filter(
      (name) => !documentedVariables(doc).has(name)
    );
    expect(missing, "add a row to docs-site/guide/theming.md").toEqual([]);
  });

  it("documents no variable the stylesheet does not define", () => {
    const stale = [...documentedVariables(doc)].filter((name) => !declaredVariables(css).has(name));
    expect(stale, "remove the row from docs-site/guide/theming.md").toEqual([]);
  });

  it("ships a copy-paste template covering the same set", () => {
    const template = doc.split("## Template")[1]?.split("## BEM hooks")[0] ?? "";
    const inTemplate = declaredVariables(template);

    // `--tk-*` overridden only inside the dark theme are listed in the table
    // but need no template row, so the template is checked as a subset.
    expect(inTemplate.size).toBeGreaterThan(15);
    expect([...inTemplate].filter((name) => !declaredVariables(css).has(name))).toEqual([]);
  });

  it("warns that the overlay colour is a colour string, not an rgb triplet", () => {
    // The colour/opacity pair looks like the `rgb(var(--c) / var(--o))`
    // convention, and guessing wrong silently paints nothing.
    expect(doc).toContain("--tk-overlay-color");
    expect(doc).toMatch(/not a triplet|colour, not a triplet/i);
  });
});
