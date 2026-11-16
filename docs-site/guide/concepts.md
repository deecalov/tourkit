# Core concepts

## The spotlight is an SVG cutout

TourKit dims the page with a single SVG path (`fill-rule: evenodd`): the
outer subpath covers the viewport, inner subpaths cut holes around the
highlighted elements. Consequences:

- **Your DOM is never touched** — no classes, no `position: relative`, no
  z-index games. The only exceptions are a temporary `scroll-margin` during
  scrolling and the opt-in [`modal`](#modal-mode) mode.
- Highlighting works inside `transform`/`filter`/`perspective` containers
  (a classic failure mode of z-index-based libraries).
- Clicks pass through the cutout natively — the hole is not painted, so the
  target stays interactive unless you set `disableInteraction`.
- `step.highlight: TargetRef[]` adds extra cutouts to the same overlay.

## Viewport coordinates

All geometry lives in layout-viewport coordinates (`position: fixed` +
`getBoundingClientRect`). Scrolling in any container, window resizes and
element resizes are tracked by one rAF-coalesced auto-updater; the tooltip
and cutout follow the target with zero drift. Pure CSS `transform` changes
that leave every observed size untouched are the one thing it cannot see —
call `tour.refresh()` after such mutations.

::: warning Container caveat
The tour root is `position: fixed`. If you mount it into a custom
`container` that has `transform`/`filter`, fixed positioning becomes relative
to that container and coordinates will be wrong. Keep the default
(`document.body`) unless you know the container is "clean".
:::

## Placement

`Placement = top | bottom | left | right` (each with optional `-start` /
`-end`) or `center`. The solver works in three passes: **flip** (walk
`placementPrecedence` when the desired side does not fit), **shift** (clamp
into the viewport) and **arrow** (aim at the target center, stay off the
rounded corners). When nothing fits, the tooltip falls back to a centered
dialog. `start`/`end` are logical and mirror automatically in RTL contexts.

The tooltip anchors to the **spotlight cutout** (target rect +
`overlay.padding`), not to the raw element, so the arrow always points at the
visible frame.

## Lifecycle and events

The engine is a state machine with a transition queue — a rapid double-click
on “Next” cannot race. All handlers may be async and are awaited.

| Event              | Notes                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| `start`            | after the steps are resolved                                                        |
| `beforeStepChange` | cancellable via `e.cancel()`, both directions                                       |
| `stepChange`       | after the step is rendered                                                          |
| `beforeExit`       | cancellable guard; runs **before** `complete`                                       |
| `complete`         | `reason: "finished" \| "skipped"`; Esc / backdrop click exit **without** completing |
| `exit`             | always last                                                                         |

Completion paths: the Done button / `next()` past the last step / programmatic
[`tour.complete()`](/api/) → `"finished"`; the × button → `"skipped"`.

## Content safety

Step `title`/`content` render via `textContent` by default — untrusted
strings are inert. Opt in to HTML with `allowHTML: true`, and pair it with a
sanitizer whenever the content is not fully under your control:

```ts
import DOMPurify from "dompurify";

createTour({ allowHTML: true, sanitize: (html) => DOMPurify.sanitize(html), steps });
```

`sanitize` runs on every HTML string just before insertion. It is ignored
while `allowHTML` is off (everything already goes through `textContent`).
Note that the intro.js compatibility adapter enables `allowHTML` by default to
match intro.js behaviour — pass `sanitize` there too.

Or build live DOM with full control:

```ts
{
  target: "#chart",
  content: "",
  renderStep: (ctx, host) => {
    const button = document.createElement("button");
    button.textContent = "Try it";
    host.append(button);
    return () => button.remove(); // cleanup on step change / exit
  },
}
```

## Theming

The default look is light; `theme: "dark"` switches to graphite,
`theme: "auto"` follows `prefers-color-scheme`. Everything is driven by CSS
custom properties on `.tk-root` (`--tk-accent`, `--tk-surface`,
`--tk-overlay-opacity`, `--tk-spotlight-ring`, ...) — override them in your
stylesheet to match your design system. All class names follow BEM
(`tk-tooltip__title`, `tk-button--primary`, ...).

## Modal mode and scroll locking

`modal: true` renders the tooltip with `aria-modal="true"` and makes
everything outside the tour root `inert` (restored on exit). Since `inert`
subtrees cannot receive focus or clicks, the highlighted target is not
interactive in this mode — `advanceOn` will warn and stay off.

`lockScroll: true` freezes page scrolling for the duration of the tour (or of
a single step, via `step.lockScroll`). The scrollbar width is compensated with
padding so the layout does not jump, and the tour's own `scrollIntoView` keeps
working — only the user's scrolling is blocked.

Both are deliberate opt-in exceptions to the “never mutate the host DOM” rule;
both restore the previous state exactly on exit.

::: warning Elements added after the tour starts
`inert` is applied to the tour root's siblings once, when the tour mounts.
Toasts or portals appended to `<body>` later stay interactive. Mount such
layers before starting a modal tour, or render them inside the tour container.
:::
