// In-memory cache for API data: loaded once, reused until refreshed or invalidated.
// Two callers asking at the same time share one request. Cleared on logout.
const store = new Map(); // key → { promise, at }

// Cached result of `load()` under `key`; { force: true } loads again
export function cached(key, load, { force = false } = {}) {
  const hit = store.get(key);
  if (hit && !force) return hit.promise;
  const promise = load().catch((e) => {
    if (store.get(key)?.promise === promise) store.delete(key); // don't keep failures
    throw e;
  });
  store.set(key, { promise, at: Date.now() });
  return promise;
}

// Drop every entry whose key starts with `prefix` (e.g. 'bills:' after saving a bill)
export function invalidate(prefix) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
  window.dispatchEvent(new CustomEvent('cache-invalidated', { detail: prefix }));
}

export const clearCache = () => invalidate('');
