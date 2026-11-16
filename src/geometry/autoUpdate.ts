import { caf, raf } from "../ui/dom";

/**
 * Reusable watcher behind `autoUpdate`: viewport-level listeners (capture
 * scroll, window resize, a ResizeObserver on the document element) are
 * attached once and live for the whole tour; only the set of observed
 * elements changes between steps. The callback is coalesced to at most one
 * invocation per animation frame.
 */
export interface AutoUpdater {
  /** Swaps the observed elements without touching the window listeners. */
  setElements(elements: Array<Element | null>): void;
  stop(): void;
}

export function createAutoUpdater(callback: () => void): AutoUpdater {
  let frame = 0;

  const schedule = () => {
    if (frame) return;
    frame = raf(() => {
      frame = 0;
      callback();
    });
  };

  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule, { passive: true });

  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(schedule);
    // The document element grows/shrinks with page content, so observing it
    // catches layout shifts (images/fonts loading) that move the target
    // without firing any scroll or window resize event.
    resizeObserver.observe(document.documentElement);
  }

  return {
    setElements(elements) {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      resizeObserver.observe(document.documentElement);
      for (const el of elements) {
        if (el) resizeObserver.observe(el);
      }
    },
    stop() {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
      if (frame) caf(frame);
    },
  };
}

/**
 * Watches the signals that commonly move the target relative to the viewport
 * (scrolling in any container, window resize, element/document resize) and
 * invokes the callback at most once per animation frame.
 *
 * Not covered: CSS transform changes, sibling DOM reordering and other layout
 * shifts that leave every observed size untouched — call `tour.refresh()`
 * after such mutations.
 *
 * Returns a cleanup function.
 */
export function autoUpdate(elements: Array<Element | null>, callback: () => void): () => void {
  const updater = createAutoUpdater(callback);
  updater.setElements(elements);
  return () => updater.stop();
}
