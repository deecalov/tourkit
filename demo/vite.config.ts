import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

// Build-only concerns: the dev server (`npm run dev`, e2e webServer) ignores
// rollup inputs. Both demo pages must land in the static build for Pages.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(here, "index.html"),
        page2: resolve(here, "page2.html"),
      },
    },
  },
});
