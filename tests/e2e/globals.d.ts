/**
 * Shapes of the objects the demo page and the IIFE bundles put on `window`,
 * so `page.evaluate` bodies stay type-checked without casting.
 */
interface TourHandle {
  start: () => Promise<boolean>;
  exit: (force?: boolean) => Promise<boolean>;
  destroy: () => void;
  readonly isActive: boolean;
}

declare var TourKit: {
  createTour: (options: unknown) => TourHandle;
};

declare var TourKitHints: {
  createHints: (options: unknown) => { render: () => unknown };
};

declare var TourKitDemo: {
  createTour: (options: unknown) => TourHandle;
  injectStyles: (options?: unknown) => () => void;
};
