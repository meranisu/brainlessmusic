/**
 * A fixed-window counter in memory, keyed by the caller (an IP for the guest door or passcode tries). Memory is enough
 * against a loop on a single process. Limits are read at `check` time, so config changes apply immediately.
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
  /** Whole seconds until reset, for `Retry-After`. At least 1. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, options: RateLimitOptions): RateLimitResult;
  /** Forgets one key's window, so a success clears earlier failures. */
  clear(key: string): void;
  /** Forget everything. For tests; never called by the server. */
  reset(): void;
}

/** Every limiter created, so tests can reset them all between cases. */
const created: RateLimiter[] = [];

export function createRateLimiter(): RateLimiter {
  const windows = new Map<string, Window>();

  const limiter: RateLimiter = {
    check(key, { limit, windowMs }) {
      const now = Date.now();
      const existing = windows.get(key);

      if (!existing || existing.resetsAt <= now) {
        // Swept on request: an idle server does no work.
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
