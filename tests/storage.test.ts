import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage, resolveStorage } from "../src/core/storage";

const quotaError = () => {
  throw new DOMException("quota", "QuotaExceededError");
};

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("resolves the local adapter by default", () => {
    const storage = resolveStorage();
    storage.set("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    expect(storage.get("k")).toBe("v");
    storage.remove("k");
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("resolves the session adapter", () => {
    const storage = resolveStorage("session");
    storage.set("k", "v");
    expect(sessionStorage.getItem("k")).toBe("v");
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("accepts a custom adapter as-is", () => {
    const custom = { get: () => "custom", set: () => {}, remove: () => {} };
    expect(resolveStorage(custom)).toBe(custom);
  });

  it("memory adapter stores values in-process", () => {
    memoryStorage.set("m", "1");
    expect(memoryStorage.get("m")).toBe("1");
    memoryStorage.remove("m");
    expect(memoryStorage.get("m")).toBeNull();
  });

  it("falls back to memory when setItem throws (QuotaExceededError)", () => {
    const storage = resolveStorage();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(quotaError);

    try {
      storage.set("quota", "v");
      // getItem succeeds and returns null — the value must come from the fallback.
      expect(localStorage.getItem("quota")).toBeNull();
      expect(storage.get("quota")).toBe("v");

      storage.remove("quota");
      expect(storage.get("quota")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("a successful set clears a stale memory shadow", () => {
    const storage = resolveStorage();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(quotaError);

    try {
      storage.set("shadow", "old"); // fails → fallback
      storage.set("shadow", "new"); // succeeds → web storage, shadow dropped
      expect(storage.get("shadow")).toBe("new");

      localStorage.removeItem("shadow");
      expect(storage.get("shadow")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to memory when web storage access throws entirely", () => {
    const storage = resolveStorage();
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(quotaError);
    storage.set("blocked", "mem"); // lands in the local fallback
    setSpy.mockRestore();

    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      expect(storage.get("blocked")).toBe("mem");
    } finally {
      getSpy.mockRestore();
      storage.remove("blocked");
    }
  });

  it("remove() clears the fallback even when web storage throws", () => {
    const storage = resolveStorage();
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(quotaError);
    storage.set("doomed", "mem"); // only the fallback holds it
    setSpy.mockRestore();

    const removeSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      expect(() => storage.remove("doomed")).not.toThrow();
    } finally {
      removeSpy.mockRestore();
    }

    expect(storage.get("doomed")).toBeNull();
  });

  it("keeps fallback namespaces separate (memory / local / session)", () => {
    const local = resolveStorage("local");
    const session = resolveStorage("session");

    // Values in the public memory adapter must not leak into web adapters.
    memoryStorage.set("shared-key", "memory-only");
    expect(local.get("shared-key")).toBeNull();
    expect(session.get("shared-key")).toBeNull();
    memoryStorage.remove("shared-key");

    // A shadow written while localStorage is broken belongs to local only...
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(quotaError);
    local.set("ns", "local-shadow");
    spy.mockRestore();

    expect(session.get("ns")).toBeNull();
    expect(memoryStorage.get("ns")).toBeNull();

    // ...and a successful session write/remove must not drop it.
    session.set("ns", "session-value");
    session.remove("ns");
    expect(local.get("ns")).toBe("local-shadow");

    local.remove("ns");
    expect(local.get("ns")).toBeNull();
  });
});
