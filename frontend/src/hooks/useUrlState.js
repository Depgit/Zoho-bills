import { useCallback, useEffect, useState } from 'react';

// State kept in the address bar (?status=PENDING&page=2) so a filtered view survives a refresh
// and can be shared. Only keys in `defaults` are read / written; default values stay out of the URL.
const read = (defaults) => {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(
    Object.entries(defaults).map(([k, d]) => {
      const v = params.get(k);
      if (v === null) return [k, d];
      return [k, typeof d === 'number' ? Number(v) || d : typeof d === 'boolean' ? v === '1' : v];
    }),
  );
};

export function useUrlState(defaults) {
  const [state, setState] = useState(() => read(defaults));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, d] of Object.entries(defaults)) {
      const v = state[k];
      if (v === d || v === '' || v === false) params.delete(k);
      else params.set(k, typeof v === 'boolean' ? '1' : String(v));
    }
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [state]);

  // Leaving the page takes its keys out of the URL
  useEffect(
    () => () => {
      const params = new URLSearchParams(window.location.search);
      Object.keys(defaults).forEach((k) => params.delete(k));
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    },
    [],
  );

  const set = useCallback((patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);
  const reset = useCallback(() => setState(defaults), []);
  return [state, set, reset];
}
