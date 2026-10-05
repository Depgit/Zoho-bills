import { useCallback, useEffect, useState } from 'react';
import { showError } from '../api/errors.js';

// A list from a cached api/ loader (e.g. zoho.taxes). Errors go to the popup unless `quiet`.
// → [list, reload(force = true)]
export function useApiList(load, { enabled = true, quiet = false } = {}) {
  const [list, setList] = useState([]);
  const run = useCallback(
    (force) =>
      load({ force })
        .then((data) => setList(data || []))
        .catch((e) => (quiet ? console.warn('Could not load list:', e) : showError(e))),
    [load, quiet],
  );
  useEffect(() => {
    if (enabled) run(false);
  }, [run, enabled]);
  const reload = useCallback(() => run(true), [run]);
  return [list, reload];
}
