import { defineConfig } from "vitepress";
import typedocSidebar from "../api/typedoc-sidebar.json";

// Deployed under https://<owner>.github.io/tourkit/docs/ (project Pages,
// the landing occupies the site root).
export default defineConfig({
  title: "TourKit",
  description:
    "Lightweight, dependency-free product tours, onboarding walkthroughs and hints. MIT, accessible, framework-agnostic.",
  base: "/tourkit/docs/",
  outDir: "../site/docs",
  // External repo links (CHANGELOG etc.) are validated at runtime, not build time.
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/" },
      { text: "Playground", link: "https://deecalov.github.io/tourkit/demo/" },
      { text: "npm", link: "https://www.npmjs.com/package/sitetourkit" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Core concepts", link: "/guide/concepts" },
            { text: "Async targets & interactive steps", link: "/guide/async-and-interactive" },
            { text: "Hints", link: "/guide/hints" },
            { text: "Theming", link: "/guide/theming" },
            { text: "Embedding & headless", link: "/guide/embedding" },
            { text: "Migrating from intro.js", link: "/guide/migration" },
            { text: "Recipes", link: "/guide/recipes" },
          ],
        },
      ],
      "/api/": [{ text: "API reference", items: typedocSidebar }],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/deecalov/tourkit" }],
    footer: {
      message: "Released under the MIT License. Not affiliated with Intro.js.",
    },
    search: { provider: "local" },
  },
});
