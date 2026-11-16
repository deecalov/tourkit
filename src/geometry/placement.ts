import type { Align, Placement, Side } from "../core/types";
import { clamp, type Rect, type Size } from "./rect";

export interface PlacementConfig {
  /** Distance between the target rect and the tooltip (arrow included). */
  gap: number;
  /** Minimum distance kept between the tooltip and the viewport edges. */
  viewportPadding: number;
  /** Half-diagonal of the arrow square; keeps the arrow away from rounded corners. */
  arrowInset: number;
  /**
   * Right-to-left context: `start`/`end` alignments are logical and mirror
   * on the horizontal axis (top/bottom sides). Physical sides stay as-is.
   */
  rtl: boolean;
}

export const defaultPlacementConfig: PlacementConfig = {
  gap: 14,
  viewportPadding: 8,
  arrowInset: 14,
  rtl: false,
};

export interface ResolvedPlacement {
  /** Final side after flipping, or "center" when nothing fits / no target. */
  side: Side | "center";
  align: Align;
  x: number;
  y: number;
  /**
   * Arrow offset along the tooltip edge (distance from the tooltip's
   * left edge for top/bottom sides, from the top edge for left/right).
   * `null` for centered placement (no arrow).
   */
  arrow: number | null;
}

const PLACEMENT_RE = /^(center|(top|bottom|left|right)(-(start|center|end))?)$/;

/**
 * Validates a placement coming from untyped sources (data attributes, the
 * intro.js adapter). An unknown value would silently degrade to a centered
 * tooltip, which reads as "the library ignored my markup".
 */
export function isPlacement(value: string | null | undefined): value is Placement {
  return typeof value === "string" && PLACEMENT_RE.test(value);
}

export function parsePlacement(placement: Placement): {
  side: Side | "center";
  align: Align | undefined;
} {
  if (placement === "center") return { side: "center", align: undefined };
  const [side, align] = placement.split("-") as [Side, Align | undefined];
  return { side, align };
}

function freeSpace(side: Side, target: Rect, viewport: Rect): number {
  switch (side) {
    case "top":
      return target.y - viewport.y;
    case "bottom":
      return viewport.y + viewport.height - (target.y + target.height);
    case "left":
      return target.x - viewport.x;
    case "right":
      return viewport.x + viewport.width - (target.x + target.width);
  }
}

function fits(
  side: Side,
  target: Rect,
  tooltip: Size,
  viewport: Rect,
  cfg: PlacementConfig
): boolean {
  const needed =
    (side === "top" || side === "bottom" ? tooltip.height : tooltip.width) +
    cfg.gap +
    cfg.viewportPadding;
  return freeSpace(side, target, viewport) >= needed;
}

/**
 * Centered (floating) placement. Both axes are clamped into the viewport:
 * a tooltip taller or wider than the screen would otherwise get a negative
 * coordinate and push its header — title and close button — out of reach.
 * The CSS caps the tooltip height and scrolls its content, so clamping to
 * the top-left padding keeps the whole dialog usable.
 */
function centered(tooltip: Size, viewport: Rect, cfg: PlacementConfig): ResolvedPlacement {
  const fit = (start: number, length: number, size: number): number =>
    clamp(
      start + (length - size) / 2,
      start + cfg.viewportPadding,
      start + length - size - cfg.viewportPadding
    );

  return {
    side: "center",
    align: "center",
    x: fit(viewport.x, viewport.width, tooltip.width),
    y: fit(viewport.y, viewport.height, tooltip.height),
    arrow: null,
  };
}

/**
 * Resolves the tooltip position in three passes:
 * 1. flip  — keep the desired side if it fits, otherwise walk `precedence`,
 *            falling back to "center" when no side has room;
 * 2. shift — clamp the cross-axis coordinate into the viewport;
 * 3. arrow — project the target center onto the tooltip edge and clamp it
 *            away from the corners.
 */
export function resolvePlacement(
  desired: Placement,
  target: Rect | null,
  tooltip: Size,
  viewport: Rect,
  precedence: Side[],
  config?: Partial<PlacementConfig>
): ResolvedPlacement {
  const cfg = { ...defaultPlacementConfig, ...config };

  if (!target || desired === "center") {
    return centered(tooltip, viewport, cfg);
  }

  const { side: desiredSide, align } = parsePlacement(desired);

  let side: Side | "center" = "center";
  if (desiredSide !== "center" && fits(desiredSide, target, tooltip, viewport, cfg)) {
    side = desiredSide;
  } else {
    const candidates = precedence.filter((s) => s !== desiredSide);
    const found = candidates.find((s) => fits(s, target, tooltip, viewport, cfg));
    if (found) side = found;
  }

  if (side === "center") {
    return centered(tooltip, viewport, cfg);
  }

  const isVertical = side === "top" || side === "bottom";

  // Main axis: fixed offset from the target on the chosen side.
  const main =
    side === "top"
      ? target.y - cfg.gap - tooltip.height
      : side === "bottom"
        ? target.y + target.height + cfg.gap
        : side === "left"
          ? target.x - cfg.gap - tooltip.width
          : target.x + target.width + cfg.gap;

  // Cross axis: alignment relative to the target, then shifted into the viewport.
  const targetStart = isVertical ? target.x : target.y;
  const targetLength = isVertical ? target.width : target.height;
  const tooltipLength = isVertical ? tooltip.width : tooltip.height;
  const viewportStart = isVertical ? viewport.x : viewport.y;
  const viewportLength = isVertical ? viewport.width : viewport.height;

  let effectiveAlign: Align = align ?? "center";

  // `start`/`end` are logical on the horizontal axis: mirror them in RTL.
  if (cfg.rtl && isVertical && effectiveAlign !== "center") {
    effectiveAlign = effectiveAlign === "start" ? "end" : "start";
  }

  let cross =
    effectiveAlign === "start"
      ? targetStart
      : effectiveAlign === "end"
        ? targetStart + targetLength - tooltipLength
        : targetStart + (targetLength - tooltipLength) / 2;

  cross = clamp(
    cross,
    viewportStart + cfg.viewportPadding,
    viewportStart + viewportLength - tooltipLength - cfg.viewportPadding
  );

  // Arrow: aim at the target center, but never enter the rounded corners.
  const targetCenter = targetStart + targetLength / 2;
  const arrow = clamp(targetCenter - cross, cfg.arrowInset, tooltipLength - cfg.arrowInset);

  return {
    side,
    align: effectiveAlign,
    x: isVertical ? cross : main,
    y: isVertical ? main : cross,
    arrow,
  };
}
