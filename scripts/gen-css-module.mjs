import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Embeds styles.css into a TS module for the `tourkit/inject-styles` entry.
// The output is committed; CI verifies it is in sync (gen + git diff).
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/styles/styles.css"), "utf8");

const banner =
  "// AUTO-GENERATED from styles.css — do not edit. Regenerate with `npm run gen:css`.\n";
const body = `${banner}export const css: string = ${JSON.stringify(css)};\n`;

writeFileSync(resolve(root, "src/styles/css.generated.ts"), body);
console.log("src/styles/css.generated.ts written");
