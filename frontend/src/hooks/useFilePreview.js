import { useCallback, useEffect, useRef, useState } from 'react';

// Preview of a file picked on this device (instant — no upload needed). Frees the old URL on change / unmount.
// → [preview { url, type } | null, show(file), clear()]
export function useFilePreview() {
  const [preview, setPreview] = useState(null);
  const current = useRef(null);
  const set = useCallback((next) => {
    if (current.current) URL.revokeObjectURL(current.current.url);
    current.current = next;
    setPreview(next);
  }, []);
  useEffect(() => () => current.current && URL.revokeObjectURL(current.current.url), []);
  const show = useCallback((file) => set({ url: URL.createObjectURL(file), type: file.type || 'application/pdf', name: file.name }), [set]);
  const clear = useCallback(() => set(null), [set]);
  return [preview, show, clear];
}
