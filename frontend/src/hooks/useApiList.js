import { useEffect, useState } from 'react';
import { showError } from '../api/errors.js';

// Load a list once on mount from an api/ function (e.g. zoho.taxes). Errors go to the popup unless `quiet`.
export function useApiList(load, { enabled = true, quiet = false } = {}) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    load()
      .then((data) => setList(data || []))
      .catch((e) => (quiet ? console.warn('Could not load list:', e) : showError(e)));
  }, [load, enabled]);
  return [list, setList];
}
