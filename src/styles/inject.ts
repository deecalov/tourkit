import { css } from "./css.generated";

/** The full TourKit stylesheet as a string (embedded at build time). */
export { css };

export interface InjectStylesOptions {
  /**
   * CSP nonce for the `<style>` fallback. Not needed when constructable
   * stylesheets are supported: `adoptedStyleSheets` bypass style-src.
   */
  nonce?: string;
  /** Where to inject: the document (default) or a shadow root. */
  target?: Document | ShadowRoot;
}

const injected = new WeakMap<Document | ShadowRoot, () => void>();

/**
 * Injects the TourKit stylesheet without a separate CSS file — the CSP-safe
 * alternative to linking `sitetourkit/styles.css` (spec §7): constructable
 * stylesheets when available, otherwise a `<style>` element that honors the
 * provided nonce. Idempotent per target; returns a cleanup function.
 */
export function injectStyles(options: InjectStylesOptions = {}): () => void {
  if (typeof document === "undefined") return () => {};
  const target = options.target ?? document;

  const existing = injected.get(target);
  if (existing) return existing;

  let cleanup: () => void;

  if (supportsConstructable(target)) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
    cleanup = () => {
      target.adoptedStyleSheets = target.adoptedStyleSheets.filter((s) => s !== sheet);
      injected.delete(target);
    };
  } else {
    const style = document.createElement("style");
    style.setAttribute("data-tk-styles", "");
    if (options.nonce) style.nonce = options.nonce;
    style.textContent = css;
    (target instanceof Document ? target.head : target).append(style);
    cleanup = () => {
      style.remove();
      injected.delete(target);
    };
  }

  injected.set(target, cleanup);
  return cleanup;
}

function supportsConstructable(target: Document | ShadowRoot): boolean {
  return (
    typeof CSSStyleSheet !== "undefined" &&
    typeof CSSStyleSheet.prototype.replaceSync === "function" &&
    "adoptedStyleSheets" in target
  );
}
