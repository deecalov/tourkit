// Runs `vitest run --coverage` with the drive letter upper-cased on Windows.
//
// Vitest keys the files a run executed by the spelling of the working
// directory (`e:\...` when VS Code opened the folder that way), while the pass
// that adds untested files globs `E:\...`. Every source file then appears twice
// in the report — once covered, once at 0 % — and the thresholds fail at ~37 %
// overall. On Linux and macOS (CI) this script is a plain pass-through.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const upperDrive = (path) =>
  process.platform === "win32" ? path.replace(/^[a-z]:/, (drive) => drive.toUpperCase()) : path;

// The CLI path needs the same spelling as the working directory: otherwise a
// second, differently cased copy of vitest is loaded and the run dies with
// "Vitest failed to find the runner".
const cli = upperDrive(createRequire(import.meta.url).resolve("vitest/vitest.mjs"));

const result = spawnSync(process.execPath, [cli, "run", "--coverage", ...process.argv.slice(2)], {
  cwd: upperDrive(process.cwd()),
  stdio: "inherit",
});
process.exit(result.status ?? 1);
