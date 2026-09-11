/**
 * A fixed-window counter, in memory, keyed by whatever the caller wants to
 * count — an IP for the guest door, an IP for the admin numpad.
 *
 * In memory on purpose. This process is the whole server, the windows are
 * seconds-to-minutes long, and a restart clearing the counters is not a
 * meaningful loss — the thing being defended against is a loop, not a
 * distributed attacker. Redis would be a dependency bought for nothing.
 *
 * Limits are passed at `check` time rather than at construction, so a config
 * value changed at runtime (or in a test) takes effect on the next request
 * instead of being frozen into the limiter when the route was registered.
 */

interface Window {
  count: number;
  /** Epoch ms at which this window ends and the count resets. */
  resetsAt: number;
}

export interface RateLimitOptions {
  /** Hits allowed per window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Whole seconds until the window resets — what a `Retry-After` header wants. Always at least 1. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, options: RateLimitOptions): RateLimitResult;
  /** Forget one key's window — used after a success, so a correct code clears the failures before it. */
  clear(key: string): void;
  /** Forget everything. For tests; never called by the server. */
  reset(): void;
}

/**
 * Every limiter ever created, so a test can reset the lot without knowing
 * which modules built which. Module-level singletons otherwise leak state
 * between test cases in the same process.
 */
const created: RateLimiter[] = [];

export function createRateLimiter(): RateLimiter {
  const windows = new Map<string, Window>();

  const limiter: RateLimiter = {
    check(key, { limit, windowMs }) {
      const now = Date.now();
      const existing = windows.get(key);

      if (!existing || existing.resetsAt <= now) {
        // Sweep here rather than on a timer: the map only grows when requests
        // arrive, so the moment a request arrives is the only moment it can
        // need trimming, and a server nobody is using does no work.
        for (const [otherKey, window] of windows) {
          if (window.resetsAt <= now) windows.delete(otherKey);
        }

        windows.set(key, { count: 1, resetsAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      existing.count += 1;
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetsAt - now) / 1000));

      return { allowed: existing.count <= limit, retryAfterSeconds };
    },

    clear(key) {
      windows.delete(key);
    },

    reset() {
      windows.clear();
    },
  };

  created.push(limiter);
  return limiter;
}

/** Clears every limiter in the process. Test-only. */
export function resetAllRateLimiters(): void {
  for (const limiter of created) limiter.reset();
}
