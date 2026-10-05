import { useEffect, useState } from 'react';

// `value`, but only after it stopped changing for `ms` (e.g. a search box)
export function useDebounced(value, ms = 350) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
