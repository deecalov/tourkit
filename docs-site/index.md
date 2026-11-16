---
layout: home

hero:
  name: TourKit
  text: Product tours that feel native
  tagline: Lightweight, dependency-free onboarding walkthroughs and hints. MIT, accessible, framework-agnostic.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: Live playground
      link: https://deecalov.github.io/tourkit/demo/

features:
  - title: SVG spotlight
    details: No z-index hacks and no DOM mutation — works inside transform/filter stacking contexts.
  - title: SPA-ready
    details: Steps wait for lazily mounted targets (waitForTarget) and the spotlight flows to them when they appear.
  - title: Interactive steps
    details: advanceOn moves the tour forward when the user clicks the highlighted element; highlight() spotlights anything without a tour.
  - title: Accessible by default
    details: Focus trap and restore, aria-live announcements, keyboard support, reduced motion, forced colors, optional modal mode.
  - title: XSS-safe content
    details: Step content renders as plain text unless you opt in; renderStep gives you live DOM without innerHTML.
  - title: Small and portable
    details: ~9 KB brotli core, zero dependencies, ESM/CJS/IIFE, SSR-safe imports, CSP-friendly style injection.
---
