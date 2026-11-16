# Embedding: shadow DOM, script tags and CSP

TourKit assumes nothing about your build. This page covers the three setups
that need more than `import { createTour } from "sitetourkit"`.

## Web components and shadow DOM

String selectors are resolved with `querySelector`, and a query stops at every
shadow boundary — `document.querySelector("#inside-my-widget")` returns `null`
for an element rendered inside a component's shadow tree. Point the tour at the
tree with `root`:

```ts
const shadow = document.querySelector("my-widget")!.shadowRoot!;

createTour({
  root: shadow,
  steps: [
    { target: "#save", content: "Lives inside the widget" },
    { target: () => document.querySelector("#outside"), content: "Function targets ignore root" },
  ],
});
```

`root` accepts a `Document`, a `ShadowRoot` or any element, and it drives three
things: string-selector resolution, the `[data-tour]` scanner and the
`[data-hint]` scanner. `createHints` and `highlight` take the same option.

Notes:

- Function targets (`target: () => el`) and element targets are resolved by
  you, so they work across any number of trees without `root`.
- Only **open** shadow roots can be traversed; a closed root is invisible to
  every library, TourKit included. Use a function target that the component
  itself provides.
- The focus trap already looks through open shadow roots, so focusable
  elements inside a highlighted web component join the Tab cycle.
- Styles do not cross the boundary either. Inject them into the tree that
  renders the tour UI — see below.

## Styles without a CSS file (CSP, micro-frontends)

`sitetourkit/styles.css` is a plain stylesheet you can import or link. When a
strict `style-src` policy or a shadow root makes that awkward, inject the
stylesheet from JavaScript instead:

```ts
import { injectStyles } from "sitetourkit/inject-styles";

const cleanup = injectStyles(); // constructable stylesheet, no <style> element
```

`injectStyles` prefers `adoptedStyleSheets`, which bypasses `style-src`
entirely. Where constructable stylesheets are unavailable it falls back to a
`<style>` element and honours a nonce:

```ts
injectStyles({ nonce: "<server-generated nonce>" });
injectStyles({ target: myShadowRoot }); // mount the tour UI inside the same root
```

The call is idempotent per target and returns a cleanup function. The raw
stylesheet is also exported as `css` if you would rather ship it yourself.

## Script tag (no bundler)

Every entry point has a global build for server-rendered pages — ASP.NET MVC,
Rails, Django, plain HTML:

```html
<link rel="stylesheet" href="https://unpkg.com/sitetourkit/dist/styles.css" />
<script src="https://unpkg.com/sitetourkit/dist/index.global.js"></script>
<script src="https://unpkg.com/sitetourkit/dist/hints.global.js"></script>
<script src="https://unpkg.com/sitetourkit/dist/locales.global.js"></script>

<script>
  TourKit.createTour({ labels: TourKitLocales.de }).start();
  TourKitHints.createHints().render();
</script>
```

| File                            | Global           | Contents                                                    |
| ------------------------------- | ---------------- | ----------------------------------------------------------- |
| `dist/index.global.js`          | `TourKit`        | `createTour`, `highlight`, `bindTriggers`, scanners, engine |
| `dist/hints.global.js`          | `TourKitHints`   | `createHints`, `fromHintAttributes`                         |
| `dist/compat-introjs.global.js` | `TourKitIntroJs` | `introJs` migration adapter                                 |
| `dist/locales.global.js`        | `TourKitLocales` | every bundled label set                                     |

For fully declarative pages, mark the elements with `data-tour` attributes and
call `TourKit.bindTriggers()` once — buttons carrying `data-tour-trigger` then
start tours with no page-specific JavaScript at all.

## Vendoring: copying `dist` into your app

Sites without a package manager (an ASP.NET `wwwroot`, a Rails `vendor/assets`)
copy the built files in. Every entry is self-contained — no shared
`chunk-*.js`, no hashed filenames — so files can be copied and referenced
one by one, and their names do not change between releases.

Take `styles.css` plus whatever you use: `index.global.js` for tours,
`hints.global.js`, `locales.global.js`, `compat-introjs.global.js`. The
matching `.js` files without `.global` are the ES-module builds for
`<script type="module">`.

Loading two entries on one page duplicates a few KB of shared internals. That
is the deliberate trade for filenames you can pin in a `<script src>`.

## Talking to the host page

While a tour is on screen the page usually needs to adjust: notification
stacks and sticky bars sit above the tooltip, hint beacons compete with the
tour for attention. TourKit sets marker classes on `<body>` so this needs no
event wiring:

```css
body.tk-tour-active .toasts {
  z-index: 40;
}
body.tk-tour-active .tk-hints {
  visibility: hidden;
}
body.tk-hints-open .sidebar {
  pointer-events: none;
}
```

`tk-tour-active`, `tk-highlight-active` and `tk-hints-open` are
reference-counted, so two overlapping instances do not strip each other's
flag. Opt out per instance with `hostClasses: false`.

Keyboard-wise, an `Esc` your page already handled (`event.defaultPrevented`)
is ignored by the tour, `highlight()` and hint popovers — a dialog opened on
top of an interactive step closes without ending the tour behind it.

## Markup that already uses `data-tour`

`data-tour` is a generic attribute name. If the page uses it for its own
anchors, a `createTour()` without `steps` would scan them and build a tour out
of their values. Rename the family instead of the markup:

```ts
createTour({ dataAttribute: "data-tk-step" }); // data-tk-step, -title, -step, ...
bindTriggers(document, { dataAttribute: "data-tk-step" }); // [data-tk-step-trigger]
fromDataAttributes(document, { attribute: "data-tk-step" });
```

The name must start with `data-`; anything else is reported and ignored.

## Headless: your own UI

The engine is DOM-free: it owns the state machine, the transition queue and the
event lifecycle, and delegates every visual to you.

```ts
import { TourEngine, resolveTarget, type EngineDelegate } from "sitetourkit";

const delegate: EngineDelegate = {
  mount: () => myOverlay.open(),
  showStep: (ctx, direction) => myOverlay.render(ctx, direction),
  unmount: () => myOverlay.close(),
};

const engine = new TourEngine(delegate);
engine.events.on("complete", ({ reason }) => track(reason));
await engine.start(steps);
```

`showStep` receives the same `StepContext` the built-in renderer uses, so
placement (`resolvePlacement`) and geometry helpers (`autoUpdate`,
`viewportRect`) remain available if you want them.
