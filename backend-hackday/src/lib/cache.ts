/**
 * Tiny in-process TTL cache with in-flight de-duplication.
 *
 * Purpose: the dashboard fans out several requests at once (every tab is warmed in the background) and
 * most of them recompute the same per-user scope. This collapses that into one DB round trip burst.
 *
 * Staleness is bounded by the TTL. Any non-GET request to the API clears the cache (see index.ts), so
 * changes made through the UI show up immediately. Changes made by the worker (a separate process) show up
 * within the TTL, which is why the TTL is short.
 */
type Entry = { at: number; value: Promise<unknown> };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;

  const value = load();
  store.set(key, { at: now, value });
  // Never keep a failed load around.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });

  if (store.size > MAX_ENTRIES) {
    for (const [k, e] of store) {
      if (now - e.at >= ttlMs) store.delete(k);
    }
    if (store.size > MAX_ENTRIES) store.clear();
  }
  return value;
}

export function clearCache() {
  store.clear();
}
