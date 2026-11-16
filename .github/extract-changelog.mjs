// Prints the CHANGELOG section for one version (used by the release workflow).
// Usage: node extract-changelog.mjs 0.5.0 path/to/CHANGELOG.md
import { readFileSync } from "node:fs";

const [version, file] = process.argv.slice(2);
if (!version || !file) {
  console.error("usage: node extract-changelog.mjs <version> <changelog>");
  process.exit(1);
}

const lines = readFileSync(file, "utf8").split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## ${version}`));
if (start === -1) {
  console.error(`No "## ${version}" section in ${file}`);
  process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith("## ")) {
    end = i;
    break;
  }
}
console.log(
  lines
    .slice(start + 1, end)
    .join("\n")
    .trim()
);
