import { useCallback, useEffect, useRef, useState } from 'react';
import { showError } from '../api/errors.js';

// Load data with `load(signal)` whenever `key` changes. An older request still running is cancelled,
// so a slow answer can never overwrite a newer one. → { data, loading, reload }
export function useRemote(load, key, { initial = null, enabled = true } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    setLoading(true);
    loadRef
      .current(ctrl.signal)
      .then((d) => !ctrl.signal.aborted && setData(d))
      .catch((e) => !ctrl.signal.aborted && e?.name !== 'CanceledError' && showError(e))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [key, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, reload };
}
