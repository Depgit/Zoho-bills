import { useCallback, useEffect, useState } from 'react';
import { allBills } from '../api/bills.js';
import { showError } from '../api/errors.js';

// Every bill of a scope, from the in-memory cache (one request the first time). refresh() loads
// fresh data; after a bill is saved / deleted / approved the list reloads by itself.
export function useBills(scope, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (force = false) => {
      setLoading(true);
      return allBills(scope, { force })
        .then(setData)
        .catch(showError)
        .finally(() => setLoading(false));
    },
    [scope],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const onInvalidate = (e) => e.detail.startsWith('bills') && load();
    window.addEventListener('cache-invalidated', onInvalidate);
    return () => window.removeEventListener('cache-invalidated', onInvalidate);
  }, [load, enabled]);

  const refresh = useCallback(() => load(true), [load]);
  return { rows: data?.rows || [], truncated: Boolean(data?.truncated), loaded: Boolean(data), loading, refresh };
}
