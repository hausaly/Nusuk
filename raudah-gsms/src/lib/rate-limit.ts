/**
 * Sliding-window rate limiter (in-memory). Fine for a single app instance; per-account lockout in the
 * database (User.failedLogins/lockedUntil) covers multi-instance deployments.
 */
export interface Limiter {
  /** Returns true when the action is allowed (and records it). */
  hit(key: string): boolean;
  /** True if the key is currently over the limit (without recording). */
  blocked(key: string): boolean;
  reset(key: string): void;
}

export function createLimiter(max: number, windowMs: number, now: () => number = Date.now): Limiter {
  const hits = new Map<string, number[]>();
  const live = (key: string) => {
    const t = now() - windowMs;
    const arr = (hits.get(key) ?? []).filter((x) => x > t);
    if (arr.length) hits.set(key, arr);
    else hits.delete(key);
    return arr;
  };
  return {
    hit(key) {
      const arr = live(key);
      if (arr.length >= max) return false;
      arr.push(now());
      hits.set(key, arr);
      return true;
    },
    blocked: (key) => live(key).length >= max,
    reset: (key) => void hits.delete(key),
  };
}

const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);
export const LOGIN_MAX = () => num(process.env.LOGIN_MAX_ATTEMPTS, 5);
export const LOGIN_WINDOW_MS = () => num(process.env.LOGIN_WINDOW_MINUTES, 15) * 60_000;

const g = globalThis as unknown as { __loginLimiters?: { account: Limiter; ip: Limiter } };
/** Failed-attempt limiters: per identifier+IP and per IP (higher ceiling to stop spraying). */
export function loginLimiters() {
  return (g.__loginLimiters ??= {
    account: createLimiter(LOGIN_MAX(), LOGIN_WINDOW_MS()),
    ip: createLimiter(LOGIN_MAX() * 4, LOGIN_WINDOW_MS()),
  });
}
