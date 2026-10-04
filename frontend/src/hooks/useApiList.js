import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { showError } from '../api/errors.js';

// GET a list once on mount (e.g. '/zoho/taxes'). Errors go to the popup unless `quiet`.
export function useApiList(path, { enabled = true, quiet = false } = {}) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    api
      .get(path)
      .then((r) => setList(r.data || []))
      .catch((e) => (quiet ? console.warn(`Could not load ${path}:`, e) : showError(e)));
  }, [path, enabled]);
  return [list, setList];
}
