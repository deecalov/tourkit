# Theming

Everything visual is a CSS custom property on `.tk-root`. There is no
`!important` anywhere in the stylesheet and no markup to override — set the
variables your design system needs and leave the rest.

```css
.tk-root {
  --tk-accent: #7c3aed;
  --tk-accent-hover: #6d28d9;
  --tk-radius: 10px;
}
```

The default look is light. `theme: "dark"` switches to graphite, and
`theme: "auto"` follows `prefers-color-scheme`; both are implemented as
overrides of the same variables, so anything you set on `.tk-root` applies to
every theme unless you scope it (`.tk-root[data-tk-theme="dark"] { ... }`).

## Every variable

| Variable                    | Type              | Light default                   | Affects                                                                             |
| --------------------------- | ----------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `--tk-z`                    | integer           | `99999`                         | Stacking order of the whole tour layer. See [layering](#layering-with-your-own-ui). |
| `--tk-overlay-color`        | **colour string** | `#05070a`                       | Fill of the dimmed backdrop.                                                        |
| `--tk-overlay-opacity`      | number 0–1        | `0.5` (dark theme `0.68`)       | Opacity of that fill.                                                               |
| `--tk-radius`               | length            | `14px`                          | Corner radius of the tooltip and hint popover.                                      |
| `--tk-surface`              | colour            | `#ffffff`                       | Tooltip / popover background, and the arrow.                                        |
| `--tk-text`                 | colour            | `#181b20`                       | Titles and ghost-button text.                                                       |
| `--tk-text-secondary`       | colour            | `#454b55`                       | Step content.                                                                       |
| `--tk-text-muted`           | colour            | `#5d6673`                       | Close button, step counter, opt-out checkbox.                                       |
| `--tk-border`               | colour            | `rgb(24 27 32 / 0.1)`           | Footer separator, ghost-button border.                                              |
| `--tk-bullet`               | colour            | `rgb(24 27 32 / 0.18)`          | Inactive bullets and progress segments.                                             |
| `--tk-shadow`               | box-shadow        | three-layer soft shadow         | Tooltip and popover elevation.                                                      |
| `--tk-accent`               | colour            | `#0f766e`                       | Primary button, active bullet, progress fill, hint markers.                         |
| `--tk-accent-hover`         | colour            | `#115e59`                       | Primary button hover, progress gradient end.                                        |
| `--tk-accent-contrast`      | colour            | `#ffffff`                       | Text on top of the accent.                                                          |
| `--tk-glow`                 | colour            | `rgb(15 118 110 / 0.3)`         | Halo around hint markers and the current progress segment.                          |
| `--tk-spotlight-ring`       | colour            | `transparent` (dark theme teal) | Outline drawn around the spotlight cutout.                                          |
| `--tk-spotlight-ring-width` | length            | `0` (dark theme `2px`)          | Thickness of that outline.                                                          |
| `--tk-spotlight-glow`       | colour            | `transparent`                   | Drop shadow of the outline.                                                         |
| `--tk-font`                 | font-family       | `system-ui, ...`                | All tour text.                                                                      |
| `--tk-tooltip-max-width`    | length            | `360px`                         | Tooltip width cap (also clamped to the viewport).                                   |
| `--tk-transition`           | duration + easing | `180ms cubic-bezier(...)`       | Fades and hover transitions.                                                        |

::: warning `--tk-overlay-color` is a colour, not a triplet
It is used as `fill: var(--tk-overlay-color)` with a separate
`fill-opacity: var(--tk-overlay-opacity)`. Write `#05070a` or `rgb(5 7 10)` —
a bare `5 7 10` triplet (the pattern some libraries use for
`rgb(var(--x) / var(--y))`) will not work here.
:::

Cutout geometry is **not** themed with CSS: the spotlight is an SVG path, so
its padding and corner radius come from options —
`overlay: { padding: 8, radius: 8 }`.

## Template

Copy this block, keep the lines you change:

```css
.tk-root {
  /* Layering */
  --tk-z: 99999;

  /* Backdrop */
  --tk-overlay-color: #05070a;
  --tk-overlay-opacity: 0.5;

  /* Surface */
  --tk-surface: #ffffff;
  --tk-radius: 14px;
  --tk-shadow:
    0 0 0 1px rgb(24 27 32 / 0.06), 0 16px 40px rgb(24 27 32 / 0.16),
    0 4px 12px rgb(24 27 32 / 0.08);

  /* Text */
  --tk-text: #181b20;
  --tk-text-secondary: #454b55;
  --tk-text-muted: #5d6673;
  --tk-border: rgb(24 27 32 / 0.1);
  --tk-bullet: rgb(24 27 32 / 0.18);

  /* Accent */
  --tk-accent: #0f766e;
  --tk-accent-hover: #115e59;
  --tk-accent-contrast: #ffffff;
  --tk-glow: rgb(15 118 110 / 0.3);

  /* Spotlight outline */
  --tk-spotlight-ring: transparent;
  --tk-spotlight-ring-width: 0;
  --tk-spotlight-glow: transparent;

  /* Typography and motion */
  --tk-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --tk-tooltip-max-width: 360px;
  --tk-transition: 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

## BEM hooks

When a variable is not enough, the class names are stable API:

- Layers: `tk-root` (`--visible`), `tk-overlay`, `tk-overlay__path`,
  `tk-overlay__ring`, `tk-interaction-guard`, `tk-live`
- Tooltip: `tk-tooltip` (`--top|--bottom|--left|--right|--center`),
  `tk-tooltip__arrow[data-side]`, `__body`, `__header`, `__title`, `__close`,
  `__content`, `__once`, `__step-number`, `__progress` /
  `__progress-seg` (`--done`, `--current`), `__footer`, `__bullets`,
  `__bullet` (`--active`), `__actions`
- Buttons: `tk-button`, `tk-button--primary`, `tk-button--ghost`
- Hints: `tk-hint` (`--hidden`, `--static`), `tk-hint__pulse`,
  `tk-hint-popover`, `__content`, `__button`

## Layering with your own UI

`--tk-z` (or the `zIndex` option) decides whether the tour renders above or
below your chrome. Put it **below** your modal layer whenever a step asks the
user to open a dialog — an interactive `advanceOn` step is unusable if the
dialog it triggers appears behind the spotlight. Do not combine that with
`modal: true`, whose `inert` treatment would block the dialog outright.

A production layout that works:

```
fx / confetti   4000
toasts            90   →  40 while a tour runs
app modals        60
tour              50   (--tk-z)
```

The last row is what the body flags are for — the host lowers its own toasts
only while a tour is on screen:

```css
body.tk-tour-active .toasts {
  z-index: 40;
}
```

See [Embedding](/guide/embedding) for the flags, and [Recipes](/guide/recipes)
for the surrounding integration patterns.
