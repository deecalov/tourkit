# Contributing to TourKit

Thanks for helping! Run the commands below from the repository root.
Use Node.js 22.13 or newer (Node.js 22 LTS is used in CI).

## Getting started

```bash
npm ci
npm run dev          # vite demo with live reload
```

## Checks to run before a PR

```bash
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint
npm run format:check # prettier
npm test             # vitest (jsdom) unit/integration tests
npm run test:e2e     # Playwright (chromium/firefox/webkit; installs via npx playwright install)
npm run build        # tsup -> dist (ESM/CJS/IIFE + d.ts + styles.css)
npm run size         # size-limit bundle budgets
npm run lint:pkg     # publint + Are The Types Wrong on the packed tarball
npm run test:pack    # smoke test: require()/import of every entry from the packed tarball
```

CI runs the same set on every push/PR.

## Ground rules

- Write documentation, examples, comments and issue/PR text in English.
  Locale dictionaries and dedicated localization tests retain their translated
  strings so every supported language continues to work.
- **No AGPL code**: never copy code, comments or CSS from `introjs-source/`
  (AGPL-3.0; the clone is kept for technical analysis, behavior comparison
  and benchmarks, and is excluded from Git and the npm package). No `introjs`
  strings in source, class names or data attributes.
- Zero runtime dependencies — new deps go to `devDependencies` only.
- The host page DOM must not be mutated (no classes/z-index on targets); the
  only exception is the temporary `scroll-margin` used while scrolling.
- New options need: a default in `src/core/options.ts`, a type in
  `src/core/types.ts`, a test, and a mention in the docs (`docs/` and the
  README where relevant).
- Behavioral changes require a CHANGELOG entry.

## Commit / PR style

Small, focused PRs with a clear description of the user-visible change.
Reference the issue when one exists.
