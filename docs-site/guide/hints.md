# Hints

Hints are pulsing beacon dots attached to elements; clicking one opens a
popover with an explanation and a “Got it” button. They live in a separate
entry so tours-only consumers do not pay for them.

```ts
import { createHints } from "sitetourkit/hints";
import { de } from "sitetourkit/locales";

const hints = createHints({
  rememberDismissed: { key: "hints:main" }, // dismissed hints stay hidden after reload
  labels: de, // translates the dismiss button, like tours
  hints: [
    { target: "#export", content: "Export to Excel", id: "export", markerPosition: "top-end" },
    { target: "#filters", content: "Saved filters live here", id: "filters" },
  ],
}).render();
```

The dismiss button reads `labels.hintDismiss` (all bundled locales provide
it); `popover: { buttonLabel }` still overrides it for a one-off label.

## Declarative markup

```html
<button data-hint="Export to Excel" data-hint-position="top-end" data-hint-id="export">
  Export
</button>
```

`createHints().render()` scans `[data-hint]` when no hints are configured.
Attributes: `data-hint` (content), `data-hint-position` (9 anchors:
`top|middle|bottom` × `start|center|end`, RTL-aware; `left`/`right` are
accepted as physical spellings so markup migrated from intro.js keeps
working), `data-hint-placement` (popover placement), `data-hint-id` (stable
identity for persistence). Unknown values are reported in the console instead
of silently falling back.

Pass `root` to scan and resolve inside a shadow tree — see
[Embedding & headless](/guide/embedding).

## Dynamic hints

```ts
const index = hints.add({ target: "#new-feature", content: "Just shipped!", id: "nf" });
hints.remove("nf"); // by id or index; an open popover is closed
```

`add()` renders the marker immediately (and auto-renders the instance when
`render()` was not called yet). A persisted dismissal for the same `id` is
respected — the marker mounts hidden.

## API summary

| Member                              | Notes                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `render()`                          | mounts markers; scans `[data-hint]` when no hints configured           |
| `add(input)` / `remove(indexOrId)`  | dynamic hints                                                          |
| `open(i, opts?)` / `close()`        | popover control; `{ scroll: true }` reveals an off-screen marker first |
| `show(i)` / `hide(i)` / `hideAll()` | marker visibility; `show()` revives a dismissed hint                   |
| `dismiss(i)`                        | hides permanently (persisted with `rememberDismissed`)                 |
| `refresh()`                         | re-sync positions                                                      |
| `destroy()`                         | full teardown                                                          |
| `on("open" \| "dismiss", cb)`       | events                                                                 |

Markers hide automatically while their target is disconnected or hidden
(zero rect) and come back when it reappears.

A click on a visible marker never scrolls the page. A programmatic
`open(i)` may need to: the marker can sit below the fold, and the popover
would then be positioned outside the viewport. Ask for it per call
(`open(i, { scroll: true })`) or for the whole instance
(`createHints({ scroll: { block: "center" } })`).

While a popover is open, `<body>` carries `tk-hints-open` — see
[Embedding](/guide/embedding#talking-to-the-host-page).

## Focus and keyboard

- Opening a popover moves focus to its button (or to the popover) and traps
  `Tab` inside it.
- `Esc` and the dismiss button close it and return focus to the marker. A
  click elsewhere closes it too but leaves focus where the user clicked — in a
  form field, say.
- An open popover is the topmost layer: the `Esc` that closes it does not also
  end a tour or a standalone `highlight()` underneath, whichever of them was
  set up first.
- Markers and popovers are labelled with the hint text. With `allowHTML` the
  markup is stripped for that label (the popover itself still renders HTML).
