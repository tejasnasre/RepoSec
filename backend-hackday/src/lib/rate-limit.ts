const buckets = new Map<string, { count: number; reset: number }>();

/** Fixed-window in-memory limiter (per process). Returns seconds to wait, or 0 if allowed. */
export function hit(key: string, limit: number, windowMs = 60_000): number {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return 0;
  }
  if (b.count >= limit) return Math.ceil((b.reset - now) / 1000);
  b.count++;
  return 0;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}, 60_000).unref?.();
