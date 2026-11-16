# Recipes

## SPA router integration

For tours that span client-side routes, combine `persistProgress` (resume
after navigation) with `waitForTarget` (the next route's UI mounts late) and
drive navigation from `beforeStepChange`:

```ts
const tour = createTour({
  persistProgress: { key: "tour:orders" },
  waitForTarget: { timeoutMs: 8000, onTimeout: "float" },
  steps: [
    { target: "#orders-link", content: "Open the orders section.", advanceOn: true },
    { target: "#orders-table", content: "Your orders live here." }, // exists only on /orders
  ],
});

tour.on("beforeStepChange", ({ to }) => {
  if (to === 1 && !location.pathname.startsWith("/orders")) {
    router.push("/orders"); // waitForTarget picks the table up once it renders
  }
});

await tour.start();
```

For full page reloads (MPA) `persistProgress` alone is enough — `start()` on
the next page resumes from the stored index.

## Tour chains

```ts
const basics = createTour({ steps: basicSteps });
const advanced = createTour({ steps: advancedSteps, showOnce: { key: "tour:advanced" } });

basics.on("complete", ({ reason }) => {
  if (reason === "finished") void advanced.start();
});
```

## Analytics

Every lifecycle point is an event — pipe them into any tracker:

```ts
tour.on("start", () => analytics.track("tour_started"));
tour.on("stepChange", ({ index }) => analytics.track("tour_step", { index }));
tour.on("complete", ({ reason }) => analytics.track("tour_completed", { reason }));
tour.on("exit", () => analytics.track("tour_closed"));
```

`complete` fires only for real completions (Done / skip button /
`tour.complete()`); Esc and backdrop clicks emit just `exit`.

## Strict CSP

TourKit needs no `unsafe-inline`: geometry is applied through the CSSOM, not
`style` attribute strings. Either link the external stylesheet or inject it
with a nonce:

```ts
import { injectStyles } from "sitetourkit/inject-styles";
injectStyles({ nonce: document.querySelector<HTMLMetaElement>("meta[name=csp-nonce]")?.content });
```

When constructable stylesheets are supported the nonce is not even needed —
`adoptedStyleSheets` bypass `style-src` entirely.

## Script tag / ASP.NET MVC

```html
<link rel="stylesheet" href="~/lib/tourkit/styles.css" />
<script src="~/lib/tourkit/index.global.js"></script>
<script src="~/lib/tourkit/locales.global.js"></script>
<script>
  // Any [data-tour-trigger] button starts a tour scanned from [data-tour] markup.
  TourKit.bindTriggers(document, { labels: TourKitLocales.de });
</script>
```

Hints and the intro.js adapter have their own globals
(`hints.global.js` → `TourKitHints`, `compat-introjs.global.js` →
`TourKitIntroJs`).

Razor views mark up steps declaratively (`data-tour`, `data-tour-title`,
`data-tour-step`, `data-tour-group`); partial views and AJAX-inserted
triggers keep working thanks to event delegation. The default `zIndex`
(99999) sits above Kendo/Telerik chrome.

## Shadow DOM

Point the tour at the shadow tree with `root` — selectors, the declarative
scanner and the focus trap all follow it:

```ts
const shadow = host.shadowRoot!;
injectStyles({ target: shadow });
createTour({ root: shadow, steps: [{ target: "#inner-button", content: "Inside the shadow." }] });
```

Full details, including the script-tag globals and the headless engine, are in
[Embedding & headless](/guide/embedding).

## Custom theme

```css
.tk-root {
  --tk-accent: #7c3aed;
  --tk-accent-hover: #6d28d9;
  --tk-radius: 10px;
  --tk-tooltip-max-width: 420px;
  --tk-overlay-opacity: 0.62;
}
```

Every variable, with its type and default, is listed in
[Theming](/guide/theming); BEM classes (`tk-tooltip__title`,
`tk-button--primary`) are stable styling hooks.

## Living next to your own dialogs and toasts

An app with real chrome has to answer one question: is the tour above or below
it? If any step is interactive (`advanceOn` on a button that opens your
dialog), the tour must stay **below** the dialog — and `modal: true` must stay
off, since its `inert` treatment would block that dialog entirely.

```
fx / confetti   4000
toasts            90   →  40 while a tour runs
app modals        60
tour              50   (--tk-z / zIndex)
```

The last row is what the body flags are for: the host lowers its own layers
only while a tour is on screen, with no JavaScript wiring.

```css
body.tk-tour-active .toasts {
  z-index: 40;
}
```

Esc is shared safely: a dialog that closes itself with `preventDefault()`
leaves the tour running underneath.

## Offering "continue where you left off"

```ts
import { createTour, getPersistedProgress } from "sitetourkit";

const KEY = "tour:onboarding";

if (getPersistedProgress(KEY) !== null) {
  // The user left mid-tour on a previous page load.
  showBanner("Continue the tour?", () =>
    createTour({ persistProgress: { key: KEY }, steps }).start()
  );
}
```

Reading the key yourself works until the storage format changes; this helper
is the supported way to ask.
