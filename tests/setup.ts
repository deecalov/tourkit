import { afterEach, beforeEach, expect } from "vitest";

/**
 * Uncaught errors and unhandled rejections normally end up in stderr and are
 * easy to miss — that is how a leaked MutationObserver went unnoticed until
 * the v0.6 audit. Anything escaping to the window fails the test instead.
 */
const escaped: unknown[] = [];

const onError = (event: ErrorEvent) => {
  escaped.push(event.error ?? event.message);
};
const onRejection = (event: PromiseRejectionEvent) => {
  escaped.push(event.reason);
};

// Pure-logic suites opt into the `node` environment and have no window.
const hasWindow = typeof window !== "undefined";

beforeEach(() => {
  escaped.length = 0;
  if (!hasWindow) return;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
});

afterEach(() => {
  if (hasWindow) {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  }
  const failures = escaped.splice(0);
  expect(failures, `escaped ${failures.length} uncaught error(s)`).toEqual([]);
});
