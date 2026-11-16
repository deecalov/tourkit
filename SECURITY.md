# Security Policy

## Supported versions

Only the latest published version of `tourkit` receives security fixes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Instead, use
GitHub's private vulnerability reporting ("Report a vulnerability" on the
Security tab of the repository) or contact the maintainer directly. You will
receive an acknowledgement within 7 days.

Include a minimal reproduction and the affected version. Coordinated
disclosure is appreciated: give us a reasonable window to ship a fix before
publishing details.

## Scope notes

- TourKit renders step/hint content as **plain text by default**. XSS is only
  possible when the integrator explicitly opts in with `allowHTML: true` (or
  uses the intro.js compat adapter, which enables HTML to match the intro.js
  contract) _and_ passes untrusted markup — this is documented, intended
  behavior, not a vulnerability in the library.
- The library has zero runtime dependencies; `npm audit` findings in
  devDependencies do not affect consumers of the published package.
