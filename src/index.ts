export { createTour, getPersistedProgress, type StartOptions, type Tour } from "./tour/tour";
export {
  fromDataAttributes,
  normalizeSteps,
  resolveDataAttribute,
  DEFAULT_DATA_ATTRIBUTE,
  type FromDataAttributesOptions,
} from "./tour/steps";
export { bindTriggers } from "./tour/triggers";
export {
  highlight,
  type Highlight,
  type HighlightMoveOptions,
  type HighlightOptions,
} from "./tour/highlight";

/**
 * Headless API: the engine owns the state machine, the transition queue and
 * the event lifecycle without touching the DOM. Pair it with your own
 * `EngineDelegate` to render a tour with a custom UI (or none at all).
 */
export { TourEngine, resolveTarget, type EngineDelegate, type EngineState } from "./core/engine";
export { Emitter, type EventMap } from "./core/emitter";

export {
  resolvePlacement,
  parsePlacement,
  isPlacement,
  defaultPlacementConfig,
  type ResolvedPlacement,
  type PlacementConfig,
} from "./geometry/placement";
export { autoUpdate } from "./geometry/autoUpdate";
export type { Rect, Size } from "./geometry/rect";

export { getDefaultOptions, defaultLabels } from "./core/options";
export {
  resolveStorage,
  memoryStorage,
  type StorageAdapter,
  type StorageKind,
} from "./core/storage";
export type {
  AdvanceOn,
  ShowOnceOptions,
  RenderStep,
  Align,
  ButtonsOptions,
  CompleteReason,
  Direction,
  Labels,
  OverlayOptions,
  Placement,
  ScrollOptions,
  Side,
  Step,
  StepContext,
  StepInput,
  TargetRef,
  TourEvents,
  TourOptions,
  TourOptionsInput,
  WaitForTargetOptions,
} from "./core/types";

declare const __TK_VERSION__: string;

/**
 * Library version. Injected from package.json at build time (tsup/vitest
 * `define`); dev servers without the define see the "0.0.0-dev" fallback.
 */
export const version: string = typeof __TK_VERSION__ !== "undefined" ? __TK_VERSION__ : "0.0.0-dev";
