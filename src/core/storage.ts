/**
 * Pluggable persistence used by `showOnce` (tours) and `rememberDismissed`
 * (hints). Web storage calls are wrapped in try/catch with an in-memory
 * fallback: privacy modes and storage quotas must never break a tour.
 */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type StorageKind = "local" | "session" | StorageAdapter;

function createMemoryAdapter(store: Map<string, string>): StorageAdapter {
  return {
    get: (key) => store.get(key) ?? null,
    set: (key, value) => {
      store.set(key, value);
    },
    remove: (key) => {
      store.delete(key);
    },
  };
}

/** Public in-process adapter (`storage: memoryStorage` in options). */
export const memoryStorage: StorageAdapter = createMemoryAdapter(new Map());

// Each web storage gets its own fallback namespace: values written while
// localStorage is broken must not leak into sessionStorage reads (or into the
// public memoryStorage), and a successful sessionStorage write must not drop
// a shadow that belongs to localStorage.
const localFallback = createMemoryAdapter(new Map());
const sessionFallback = createMemoryAdapter(new Map());

function wrapWebStorage(getStore: () => Storage, fallback: StorageAdapter): StorageAdapter {
  return {
    get(key) {
      try {
        // A `setItem` that failed with QuotaExceededError leaves the value in
        // the fallback while `getItem` still succeeds (returning null) — so
        // the fallback must also cover the "web storage has no value" case.
        return getStore().getItem(key) ?? fallback.get(key);
      } catch {
        return fallback.get(key);
      }
    },
    set(key, value) {
      try {
        getStore().setItem(key, value);
        // Drop a stale shadow left by an earlier failed write.
        fallback.remove(key);
      } catch {
        fallback.set(key, value);
      }
    },
    remove(key) {
      fallback.remove(key);
      try {
        getStore().removeItem(key);
      } catch {
        // Already removed from the fallback; nothing else to clean up.
      }
    },
  };
}

export function resolveStorage(kind: StorageKind = "local"): StorageAdapter {
  if (kind === "local") return wrapWebStorage(() => window.localStorage, localFallback);
  if (kind === "session") return wrapWebStorage(() => window.sessionStorage, sessionFallback);
  return kind;
}
