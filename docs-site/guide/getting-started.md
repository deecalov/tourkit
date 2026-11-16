# Getting started

## Install

```bash
npm install tourkit
```

For script-tag setups use the IIFE build (`dist/index.global.js`, global
`TourKit`) — see [Recipes](/guide/recipes#script-tag-asp-net-mvc).

## Your first tour

```ts
import { createTour } from "tourkit";
import "tourkit/styles.css";

const tour = createTour({
  progress: true,
  steps: [
    { title: "Welcome!", content: "A floating step without a target." },
    { target: "#save", title: "Saving", content: "Click here to save.", placement: "bottom-start" },
    { target: () => document.querySelector(".chart"), content: "A lazily resolved target." },
  ],
});

tour.on("complete", ({ reason }) => console.log(reason)); // "finished" | "skipped"
await tour.start();
```

Styles can also be injected without a CSS file — useful under a strict CSP or
inside shadow DOM:

```ts
import { injectStyles } from "tourkit/inject-styles";
injectStyles({ nonce: myCspNonce }); // idempotent, returns a cleanup function
```

## Declarative steps

Mark up elements and start a tour without step definitions — the scanner
picks up `[data-tour]` attributes:

```html
<button data-tour="Click to save" data-tour-title="Saving" data-tour-step="2">Save</button>
```

```ts
createTour().start(); // scans [data-tour] when no steps are configured
```

| Attribute                  | Effect                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| `data-tour`                | Step content (required — an element without it is skipped)               |
| `data-tour-title`          | Step title                                                               |
| `data-tour-step`           | Explicit 1-based slot; unnumbered elements fill the gaps                 |
| `data-tour-group`          | Only scanned when the group is requested                                 |
| `data-tour-placement`      | `top`/`bottom`/`left`/`right` with optional `-start`/`-end`, or `center` |
| `data-tour-no-interaction` | Blocks interaction with the target                                       |
| `data-tour-lock-scroll`    | Freezes page scrolling on this step                                      |
| `data-tour-highlight`      | Comma-separated selectors for extra spotlight cutouts                    |
| `data-tour-wait`           | `false`/`off` to disable waiting, or a timeout in ms                     |
| `data-tour-advance-on`     | Empty for a click, or an event name                                      |

Hidden elements (`display: none`, `visibility: hidden`) are skipped, and an
unknown placement or wait value is reported instead of silently ignored.

::: tip Already using `data-tour`?
The base name is configurable, so you do not have to rename your markup:
`createTour({ dataAttribute: "data-tk-step" })` scans `data-tk-step`,
`data-tk-step-title` and so on. Pass the same option to `bindTriggers`, whose
trigger attribute becomes `[data-tk-step-trigger]`.
:::

For server-rendered pages, `bindTriggers()` starts tours from any
`[data-tour-trigger]` element with zero application JS:

```ts
import { bindTriggers } from "tourkit";
import { de } from "tourkit/locales"; // ar, de, es, fr, it, ja, pl, ptBR, ru, tr, zhCN

const unbind = bindTriggers(document, { labels: de });
```

Steps are scanned inside the root you pass, so a binding scoped to a widget
tours only that widget. The returned function unbinds the delegate **and**
tears down a tour it started — call it on route changes.

## Show once

```ts
createTour({
  showOnce: {
    key: "tour:onboarding",
    checkbox: true, // renders "Don't show this again"
    ttlMs: 30 * 24 * 60 * 60 * 1000, // optional: offer it again in 30 days
  },
  steps,
});
```

Completing the tour (or ticking the checkbox) persists the key in
`localStorage` (configurable: `sessionStorage` or a custom adapter) and the
next `start()` resolves to `false`. With `ttlMs` the mark expires after the
given time and the tour runs again; without it the opt-out is permanent.

## Multi-page tours

```ts
createTour({ persistProgress: { key: "tour:orders" }, steps });
```

The current step index is stored on every step change; `start()` on the next
page resumes where the user left off. Completing or explicitly exiting clears
the key.

To decide _whether_ to offer that resume — before building the tour — ask the
library instead of reading storage yourself:

```ts
import { getPersistedProgress } from "tourkit";

if (getPersistedProgress("tour:orders") !== null) showResumeBanner();
```

## Switching tours

Two tours on screen at once means two overlays and two focus traps, so
`start()` warns about it. When switching deliberately — say, from a help menu
— let the new tour clear the old one:

```ts
await advancedTour.start({ replace: true });
```
