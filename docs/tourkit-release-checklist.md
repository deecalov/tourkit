# TourKit: GitHub and release checklist

## Repository layout

This repository contains the standalone TourKit package at its root. Run all
commands here. Node.js 22.13 or newer is required for development tooling;
`.nvmrc` selects Node.js 22. The published library retains its own runtime
compatibility declaration in `package.json`.

The repository was prepared from a source snapshot with a new Git history.
Local dependencies, builds, test reports, editor settings, internal integration
feedback and the reference Intro.js checkout are excluded. The public benchmark
uses the pinned npm development dependencies; no reference checkout is needed.

## Validate before publishing

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run build
npm run size
npm run lint:pkg
npm run test:pack
npm run site:build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Use `--with-deps` when installing browsers on Linux. Existing visual baselines
were captured on Windows. The CI workflow runs functional tests on Linux and
enables visual tests once Linux snapshots are present. Run the manual
**Update visual baselines (linux)** workflow to generate and review those images.
Its commit step requires Actions to have write access to repository contents;
branch protection may require applying the uploaded artifact through a PR.

## Upload to GitHub

Create an empty repository without a generated README or license. Commit this
folder and add the chosen remote:

```bash
git add .
git commit -m "Initial TourKit source release"
git remote add origin https://github.com/deecalov/tourkit.git
git push -u origin main
```

The remote above is the project identity already used in package metadata,
badges and links. If a different owner or repository name is chosen, update
those links, `package.json`, the docs navigation and the VitePress `base`
before publishing. No existing remote repository is changed by preparing
this folder.

## GitHub Pages

Enable **Settings > Pages > Source > GitHub Actions**, then run **Deploy site
(GitHub Pages)** from the Actions tab. Deployment is manual so uploading source
to a new repository does not attempt to publish an unconfigured Pages site.
The workflow builds the library, landing, demo and documentation into `site/`
and deploys that artifact. The default URLs are `/tourkit/`, `/tourkit/demo/` and
`/tourkit/docs/` on the owner's GitHub Pages host. VitePress uses
`/tourkit/docs/` as its base path.

## npm releases

The release workflow publishes on a pushed `v*` tag. It verifies that the tag
matches `package.json`, runs the package checks via `prepublishOnly`, publishes
to npm with provenance, and creates a GitHub Release using the matching
CHANGELOG section. Uploading the main branch does not publish an npm package.

Before pushing a version tag, confirm the npm package name and publishing
access. Configure npm Trusted Publishing for this repository and `release.yml`,
or supply the workflow's `NPM_TOKEN` secret using an account authorized to
publish the package. Authentication and package availability must be verified
at release time. Keep credentials in GitHub secrets, outside repository files.

## Undoing a release

Keep the previous working Git revision and npm version available. A Pages
rollback rebuilds a known working revision through the Pages workflow. For an
npm regression, publish a new patch release after validation; moving an existing
Git tag does not replace the already published npm artifact.

## Source snapshot validation: 2026-11-16

Validated locally on Windows with Node.js 22.23.0 and npm 10.8.2:

| Check                                                    | Result                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Clean dependency install, lint, formatting, typecheck    | Passed                                                                                                |
| Unit tests                                               | 345 passed in 40 files                                                                                |
| Coverage                                                 | 97.74% statements/lines, 91.78% branches, 93.50% functions; all thresholds passed                     |
| Library build and bundle budgets                         | Passed; core ESM 10.66 kB brotli, CSS 3.79 kB brotli                                                  |
| Package validation and packed consumer smoke test        | Passed for ESM, CJS, CSS and global entries                                                           |
| Site build                                               | Landing, demo, guide and API generated successfully                                                   |
| Playwright suite                                         | 99 passed, 2 expected skips for forced-colors outside Chromium                                        |
| Manual browser checks through Playwright MCP             | Landing tour, guide/API navigation, demo start/next/close at 375 x 667                                |
| Export checks                                            | YAML parsed, relative Markdown links resolved, credential patterns absent                             |
| Library implementation compared with the source snapshot | Unchanged; generic test fixtures and visual baselines use English                                     |
| Publication language                                     | English documentation, examples and comments; locale data and its dedicated tests retain translations |

Build and browser warnings to retain for later documentation maintenance:

- TypeDoc reports that `HintOpenOptions` is referenced but not included in the
  generated API reference.
- The VitePress 1.6.4 home page logs an SSR/client style mismatch for
  `--vp-offset`; guide and API navigation worked in the local review.
- The landing and demo have no favicon, so a fresh browser's automatic
  `/favicon.ico` request returns 404. No application runtime errors were
  observed in the demo walkthrough or the API page.

These checks cover the local source snapshot. GitHub-hosted Actions, Pages and
npm publication require the repository/account setup above and have not been
executed as part of preparing this folder.
