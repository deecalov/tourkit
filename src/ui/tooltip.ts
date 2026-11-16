import { formatLabel } from "../core/options";
import type { StepContext, TourOptions } from "../core/types";
import { resolvePlacement, type ResolvedPlacement } from "../geometry/placement";
import { viewportRect, type Rect, type Size } from "../geometry/rect";
import { h, nextId, setContent } from "./dom";
import { trapFocus } from "./focus";

export interface TooltipCallbacks {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onBullet: (index: number) => void;
  /** Current persisted state of the `showOnce` checkbox. */
  isShowOnceChecked: () => boolean;
  onShowOnceChange: (checked: boolean) => void;
}

const ARROW_HALF = 7;
const SIDES = ["top", "bottom", "left", "right", "center"] as const;

/**
 * The tooltip view: renders step content and positions itself next to the
 * target rect using the placement solver. Rebuilt content per step; the
 * element itself is persistent for the lifetime of the tour.
 */
export class TooltipView {
  readonly el: HTMLDivElement;

  private readonly _arrow: HTMLDivElement;
  private readonly _body: HTMLDivElement;
  private readonly _titleId = nextId("title");
  private readonly _contentId = nextId("content");
  private readonly _releaseTrap: () => void;

  private _ctx: StepContext | null = null;
  private _placement: ResolvedPlacement | null = null;
  private _contentCleanup: (() => void) | null = null;
  /** Cached per step in render(): getComputedStyle forces a style recalc,
   *  so the hot resync path must not call it on every frame. */
  private _rtl = false;

  constructor(
    private _options: TourOptions,
    private readonly _callbacks: TooltipCallbacks
  ) {
    this._arrow = h("div", { className: "tk-tooltip__arrow", attrs: { "aria-hidden": "true" } });
    this._body = h("div", { className: "tk-tooltip__body" });

    this.el = h(
      "div",
      {
        className: "tk-tooltip",
        attrs: { role: "dialog", tabindex: -1, "aria-describedby": this._contentId },
      },
      [this._arrow, this._body]
    );

    // When interaction with the target is allowed, its focusable elements
    // join the Tab cycle so keyboard users can actually reach it.
    this._releaseTrap = trapFocus(this.el, () => {
      const ctx = this._ctx;
      if (!ctx?.target) return null;
      // Modal mode makes the host page inert — the target cannot take focus.
      if (this._options.modal) return null;
      const disabled = ctx.step.disableInteraction ?? this._options.disableInteraction;
      return disabled ? null : ctx.target;
    });
  }

  get placement(): ResolvedPlacement | null {
    return this._placement;
  }

  setOptions(options: TourOptions): void {
    this._options = options;
  }

  /**
   * Updates the step context without re-rendering — used when the renderer
   * re-resolves a replaced target so the focus trap and placement reads
   * do not keep pointing at a disconnected element.
   */
  syncContext(ctx: StepContext): void {
    this._ctx = ctx;
  }

  /** Rebuilds the tooltip content for a step. */
  render(ctx: StepContext, total: number): void {
    this._runContentCleanup();
    this._ctx = ctx;
    const { step, index } = ctx;
    const o = this._options;

    // The tooltip inherits direction from its container, so its own computed
    // style is the source of truth for RTL alignment mirroring. Read once per
    // step: the value cannot change without a re-render in practice.
    this._rtl = this.el.isConnected && getComputedStyle(this.el).direction === "rtl";

    // render() rewrites el.className below, dropping the tk-tooltip--{side}
    // modifier — the position() dirty-check must not skip restoring it.
    this._placement = null;

    this.el.className = ["tk-tooltip", o.classes?.tooltip ?? "", step.classes?.tooltip ?? ""]
      .filter(Boolean)
      .join(" ");

    this._body.replaceChildren();

    // Header: title + close (skip) button.
    const title = h("h2", { className: "tk-tooltip__title", attrs: { id: this._titleId } });
    if (step.title) setContent(title, step.title, o.allowHTML, o.sanitize);

    // The dialog's accessible name: the title when present, otherwise a
    // step announcement — aria-labelledby must never point at a missing node.
    if (step.title) {
      this.el.setAttribute("aria-labelledby", this._titleId);
      this.el.removeAttribute("aria-label");
    } else {
      this.el.removeAttribute("aria-labelledby");
      this.el.setAttribute("aria-label", formatLabel(o.labels.stepAnnouncement, index + 1, total));
    }

    const header = h("div", { className: "tk-tooltip__header" }, [step.title ? title : null]);

    if (o.buttons.skip) {
      header.append(
        h("button", {
          className: "tk-tooltip__close",
          text: "\u00d7",
          attrs: { type: "button", "aria-label": o.labels.skip },
          on: { click: () => this._callbacks.onSkip() },
        })
      );
    }
    this._body.append(header);

    // Content: either the custom renderer (live DOM, forms, media) or inert text.
    const content = h("div", { className: "tk-tooltip__content", attrs: { id: this._contentId } });
    const renderStep = step.renderStep ?? o.renderStep;
    if (renderStep) {
      // Application code: a throwing renderer must still leave a usable
      // tooltip (header, footer and navigation) rather than abort the step.
      try {
        const cleanup = renderStep(ctx, content);
        if (typeof cleanup === "function") this._contentCleanup = cleanup;
      } catch (error) {
        console.error("[tourkit] renderStep failed", error);
      }
    } else {
      setContent(content, step.content, o.allowHTML, o.sanitize);
    }
    this._body.append(content);

    // Opt-out checkbox ("don't show this again").
    if (o.showOnce?.checkbox) {
      this._body.append(
        h("label", { className: "tk-tooltip__once" }, [
          h("input", {
            className: "tk-tooltip__once-box",
            attrs: {
              type: "checkbox",
              checked: this._callbacks.isShowOnceChecked() ? "" : undefined,
            },
            on: {
              change: (e) =>
                this._callbacks.onShowOnceChange((e.target as HTMLInputElement).checked),
            },
          }),
          h("span", { text: o.labels.dontShowAgain }),
        ])
      );
    }

    // Meta row: "3 of 7" and/or progress bar.
    if (o.stepNumbers) {
      this._body.append(
        h("div", {
          className: "tk-tooltip__step-number",
          text: formatLabel(o.labels.stepOf, index + 1, total),
        })
      );
    }

    if (o.progress) {
      const pct = Math.round(((index + 1) / total) * 100);
      // Segmented bar: one segment per step (completed + current are filled,
      // the current one animates in and glows). Reads as discrete progress.
      this._body.append(
        h(
          "div",
          {
            className: "tk-tooltip__progress",
            attrs: {
              role: "progressbar",
              "aria-label": formatLabel(o.labels.stepAnnouncement, index + 1, total),
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": pct,
              "aria-valuetext": formatLabel(o.labels.stepOf, index + 1, total),
            },
          },
          Array.from({ length: total }, (_, i) =>
            h("span", {
              className: [
                "tk-tooltip__progress-seg",
                i < index ? "tk-tooltip__progress-seg--done" : "",
                i === index ? "tk-tooltip__progress-seg--current" : "",
              ]
                .filter(Boolean)
                .join(" "),
            })
          )
        )
      );
    }

    // Footer: bullets + navigation buttons.
    const footer = h("div", { className: "tk-tooltip__footer" });

    if (o.bullets && total > 1) {
      footer.append(
        h(
          "div",
          { className: "tk-tooltip__bullets" },
          Array.from({ length: total }, (_, i) =>
            h("button", {
              className: `tk-tooltip__bullet${i === index ? " tk-tooltip__bullet--active" : ""}`,
              // The active crumb is a large circle showing the step number;
              // inactive crumbs stay as plain dots (number hidden via CSS).
              text: i === index ? String(i + 1) : undefined,
              attrs: {
                type: "button",
                "aria-label": formatLabel(o.labels.stepAnnouncement, i + 1, total),
                "aria-current": i === index ? "step" : undefined,
              },
              on: { click: () => this._callbacks.onBullet(i) },
            })
          )
        )
      );
    }

    const actions = h("div", { className: "tk-tooltip__actions" });
    const buttonClass = o.classes?.button ? ` ${o.classes.button}` : "";

    const showBack = o.buttons.back && total > 1 && !(o.buttons.hideBackOnFirst && index === 0);
    if (showBack) {
      actions.append(
        h("button", {
          className: `tk-button tk-button--ghost${buttonClass}`,
          text: o.labels.back,
          attrs: { type: "button", disabled: index === 0 ? "" : undefined },
          on: { click: () => this._callbacks.onBack() },
        })
      );
    }

    const isLast = index === total - 1;
    const asDone = isLast && o.buttons.doneOnLast;
    // `hideNextOnLast` removes the disabled Next stub on the last step; Done
    // (when `doneOnLast` is on) is still rendered.
    const showNext = o.buttons.next && !(o.buttons.hideNextOnLast && isLast && !asDone);
    if (showNext) {
      actions.append(
        h("button", {
          className: `tk-button tk-button--primary${buttonClass}`,
          text: asDone ? o.labels.done : o.labels.next,
          attrs: {
            type: "button",
            "data-tk-action": asDone ? "done" : "next",
            disabled: isLast && !o.buttons.doneOnLast ? "" : undefined,
          },
          on: { click: () => this._callbacks.onNext() },
        })
      );
    }

    if (actions.childElementCount > 0 || footer.childElementCount > 0) {
      footer.append(actions);
      this._body.append(footer);
    }
  }

  /** Layout read of the current tooltip size (for the batched read phase). */
  measure(): Size {
    return { width: this.el.offsetWidth, height: this.el.offsetHeight };
  }

  /**
   * Measures the tooltip and applies the resolved placement.
   * `anchor` is the rect the tooltip attaches to — the spotlight cutout
   * (stage) for highlighted steps, `null` for centered steps.
   * Safe to call repeatedly (autoUpdate). The caller may pass pre-read
   * `measured` values to keep layout reads out of the write phase.
   */
  position(anchor: Rect | null, measured?: { size: Size; viewport: Rect }): void {
    if (!this._ctx) return;

    const desired = this._ctx.step.placement;
    const size = measured?.size ?? this.measure();
    const resolved = resolvePlacement(
      desired,
      anchor,
      size,
      measured?.viewport ?? viewportRect(),
      this._options.placementPrecedence,
      { rtl: this._rtl }
    );

    // Dirty-check: an unchanged placement means every DOM write below would
    // be a no-op — skip them all (the common case for scroll resyncs that
    // do not actually move the target within the viewport).
    const prev = this._placement;
    this._placement = resolved;
    if (
      prev !== null &&
      prev.side === resolved.side &&
      prev.align === resolved.align &&
      prev.x === resolved.x &&
      prev.y === resolved.y &&
      prev.arrow === resolved.arrow
    ) {
      return;
    }

    for (const side of SIDES) {
      this.el.classList.toggle(`tk-tooltip--${side}`, resolved.side === side);
    }

    this.el.style.left = `${Math.round(resolved.x)}px`;
    this.el.style.top = `${Math.round(resolved.y)}px`;

    if (resolved.arrow === null) {
      this._arrow.style.display = "none";
    } else {
      this._arrow.style.display = "";
      this._arrow.dataset["side"] = resolved.side;
      if (resolved.side === "top" || resolved.side === "bottom") {
        this._arrow.style.left = `${Math.round(resolved.arrow - ARROW_HALF)}px`;
        this._arrow.style.top = "";
      } else {
        this._arrow.style.top = `${Math.round(resolved.arrow - ARROW_HALF)}px`;
        this._arrow.style.left = "";
      }
    }
  }

  /** Moves keyboard focus to the primary action (or the dialog itself). */
  focus(): void {
    const primary = this.el.querySelector<HTMLElement>(".tk-button--primary:not([disabled])");
    (primary ?? this.el).focus({ preventScroll: true });
  }

  destroy(): void {
    this._runContentCleanup();
    this._releaseTrap();
    this.el.remove();
  }

  private _runContentCleanup(): void {
    const cleanup = this._contentCleanup;
    this._contentCleanup = null;
    if (!cleanup) return;
    try {
      cleanup();
    } catch (error) {
      console.error("[tourkit] renderStep cleanup failed", error);
    }
  }
}
