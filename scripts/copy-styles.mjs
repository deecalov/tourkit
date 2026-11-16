import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

// The source banner carries no version (it would drift into the committed
// css.generated.ts on every bump) — stamp it in for the shipped file only.
const css = readFileSync(resolve(root, "src/styles/styles.css"), "utf8").replace(
  "TourKit | MIT License",
  `TourKit v${version} | MIT License`
);

mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(resolve(root, "dist/styles.css"), css);
console.log(`dist/styles.css copied (banner v${version})`);
