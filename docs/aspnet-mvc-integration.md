# TourKit in ASP.NET Core MVC

> A practical integration guide for server-rendered applications, Razor Views,
> and Telerik UI. Requires TourKit 0.4.0 or newer; section 6 covers v0.7 features.

## 1. Include the files

Copy `index.global.js` and `styles.css` from `dist/` into
`wwwroot/lib/tourkit/`. The IIFE build exposes `TourKit`. Optional entries are
`locales.global.js` (`TourKitLocales`), `hints.global.js` (`TourKitHints`), and
`compat-introjs.global.js` (`TourKitIntroJs`). Each file is self-contained.
Since v0.7 there is no shared `chunk-*.js`, so upgrades replace the same filenames.

In `_Layout.cshtml`:

```cshtml
<link rel="stylesheet" href="~/lib/tourkit/styles.css" asp-append-version="true" />
<script src="~/lib/tourkit/index.global.js" asp-append-version="true"></script>
<script src="~/lib/tourkit/locales.global.js" asp-append-version="true"></script>
```

With CSP enabled, apply the same script nonce policy as the rest of your
application. External CSS avoids injected `<style>` elements; TourKit does not
use `eval`. Allow the corresponding script and stylesheet URLs in your policy.

## 2. Declarative tours

Declare steps in Razor markup, including model-provided text. A
`data-tour-trigger` button starts the matching group:

```cshtml
<button type="button" class="btn btn-outline-secondary" data-tour-trigger="billing">
    How does this section work?
</button>

<div id="grid" data-tour="@Model.GridHint" data-tour-title="Invoices"
     data-tour-group="billing" data-tour-step="1">
    @(Html.Kendo().Grid<InvoiceViewModel>() /* configure the grid here */)
</div>

<a asp-action="Export" data-tour="Schedule an Excel export."
   data-tour-group="billing" data-tour-step="2">Export</a>
```

Bind triggers once in the layout. Event delegation also covers buttons inserted
later by AJAX or partial views. The supplied root limits step discovery:
`document` searches the whole page; `bindTriggers(widgetElement)` searches only
that widget. The returned cleanup function removes the listener and destroys
its tour. Call it when unloading an application screen.

```js
const unbindTours = TourKit.bindTriggers(document);
// When the screen is unloaded:
// unbindTours();
```

The trigger value selects `data-tour-group`; an empty value starts a tour of
all matching `[data-tour]` elements. English labels are the default. For another
supported language, pass a dictionary from `TourKitLocales` as `labels`.

Step content uses plain text by default (`allowHTML: false`). Keep normal
Razor attribute encoding enabled when inserting model values.

## 3. Programmatic tours

```js
const tour = TourKit.createTour({
  // Include a stable user identifier in this key in your application.
  showOnce: { key: "tour:invoices:user-id", checkbox: true },
  labels: {
    next: "Next",
    back: "Back",
    done: "Done",
    skip: "Close",
    stepOf: "{step} of {total}",
    stepAnnouncement: "Step {step} of {total}",
    dontShowAgain: "Don't show this again",
  },
  steps: [
    { target: "#grid", title: "Invoices", content: "A list with server-side pagination." },
    { target: ".k-grid-toolbar", content: "The Kendo Grid toolbar." },
  ],
});
tour.on("complete", ({ reason }) => console.log("Onboarding completed:", reason));
await tour.start();
```

Bundler users can import a label set from `sitetourkit/locales`, for example
`import { de } from "sitetourkit/locales"`.

## 4. Multi-page tours

Traditional MVC navigation reloads the page. Use `persistProgress` and load the
same tour definition on both pages:

```js
const tour = TourKit.createTour({
  persistProgress: { key: "tour:orders" },
  steps: [/* steps from both pages; missing targets use a centered tooltip */],
});

if (
  location.pathname.startsWith("/Orders/Details") &&
  localStorage.getItem("tour:orders") !== null
) {
  await tour.start(); // Continue at the saved step.
}
```

For a step that asks the user to follow a link, target the link itself. Clicks
pass through the spotlight cutout. A step's `onShown` hook can advance the saved
index before navigation; see `demo/mpTour.ts`. Use `getPersistedProgress()` if
the host offers an explicit resume action.

## 5. Telerik and Kendo coexistence

- The default `--tk-z: 99999` is above the usual `k-window` and `k-dialog`
  layers (approximately 10000–20000). Override `zIndex` only when your own
  layers require it, for example `createTour({ zIndex: 100500 })`.
- Targets inside widgets with `transform` animations remain in place; the SVG
  spotlight does not raise the target into a different stacking layer.
- Use a function target for DOM that a widget replaces:
  `target: () => document.querySelector(".k-grid-toolbar")`.
- After a grid redraw, call `tour.refresh()`, or `refresh(true)` when declarative
  step attributes also need to be scanned again.

## 6. Host toasts, dialogs and hotkeys (v0.7)

TourKit sets reference-counted body classes while its UI is mounted:
`tk-tour-active`, `tk-highlight-active`, and `tk-hints-open`. Style host layers
against these flags, or disable them with `hostClasses: false`.

```css
body.tk-tour-active .toast-container {
  z-index: 40;
}
body.tk-tour-active .app-hints {
  visibility: hidden;
}
```

When an interactive step (`advanceOn`) asks the user to open a host dialog,
place `--tk-z` below that dialog and leave `modal: true` disabled: its `inert`
treatment would block the dialog. An example stack is effects 4000, toasts 90,
host dialogs 60, tour 50, and toasts while touring 40. An Escape key already
handled with `preventDefault()` closes the host dialog without ending the tour.

If the application already uses `data-tour`, rename the declarative family:

```js
TourKit.bindTriggers(document, { dataAttribute: "data-tk-step" });
```

## 7. Integration checklist

- [ ] Include `styles.css`, `index.global.js`, and optional entries in the layout with cache busting.
- [ ] Add encoded `data-tour*` attributes, or choose another `dataAttribute` prefix.
- [ ] Bind triggers once and retain the cleanup function where necessary.
- [ ] Scope `showOnce` keys to the user.
- [ ] Use `persistProgress` for cross-page navigation.
- [ ] Adjust `zIndex` only when the host layer hierarchy requires it.
- [ ] Style host toasts and overlays using the body flags.
