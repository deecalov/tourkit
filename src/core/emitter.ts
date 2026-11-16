/**
 * Minimal typed event emitter.
 * Handlers may be async; `emit` awaits all of them sequentially so that
 * cancellable events (via `cancel()`) work with asynchronous listeners.
 */
export type EventMap = Record<string, (payload: never) => void | Promise<void>>;

export class Emitter<TEvents extends EventMap> {
  private readonly _listeners = new Map<keyof TEvents, Set<TEvents[keyof TEvents]>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<E extends keyof TEvents>(event: E, handler: TEvents[E]): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  /** Subscribe to a single occurrence of an event. */
  once<E extends keyof TEvents>(event: E, handler: TEvents[E]): () => void {
    const off = this.on(event, (async (payload: never) => {
      off();
      await handler(payload);
    }) as TEvents[E]);
    return off;
  }

  off<E extends keyof TEvents>(event: E, handler: TEvents[E]): void {
    this._listeners.get(event)?.delete(handler);
  }

  /**
   * Handlers are application code: one of them throwing must not abort the
   * remaining listeners, reject the transition promise (the tour drives
   * transitions with `void engine.next()`, so nobody would catch it) or leave
   * the tour half-rendered. Failures are reported and swallowed — a broken
   * analytics callback is not a reason to strand the user mid-tour.
   */
  async emit<E extends keyof TEvents>(event: E, payload: Parameters<TEvents[E]>[0]): Promise<void> {
    const set = this._listeners.get(event);
    if (!set) return;

    // Copy: handlers may unsubscribe themselves during iteration (e.g. `once`).
    for (const handler of [...set]) {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`[tourkit] "${String(event)}" handler failed`, error);
      }
    }
  }

  removeAll(): void {
    this._listeners.clear();
  }
}
