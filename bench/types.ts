/**
 * Uniform in-page adapter both stands (TourKit and intro.js) expose on
 * `window`. The Playwright spec drives only this contract, so the measured
 * glue code is identical for every library.
 */
export interface BenchApi {
  readonly library: string;
  /** Starts the tour; resolves when the first step is rendered. */
  start(): Promise<void>;
  /** Advances one step; resolves when the new step is rendered. */
  next(): Promise<void>;
  /** Ends the tour; resolves when the tour UI is gone. */
  exit(): Promise<void>;
  /** Starts a one-step tour on `#nested-card` (inside the side scroller). */
  startNested(): Promise<void>;
  /** Viewport-coordinate center of the current highlight box, if any. */
  highlightCenter(): { x: number; y: number } | null;
}

declare global {
  interface Window {
    benchApi: BenchApi;
  }
}
