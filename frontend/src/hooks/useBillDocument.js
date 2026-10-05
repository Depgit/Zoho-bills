import { useEffect, useState } from 'react';
import { billFile } from '../api/bills.js';

// Loads a bill's file as an object URL (and frees it when the bill changes / unmounts).
// Returns { url, type } — url is null while loading or when there's no file.
export function useBillDocument(bill) {
  const [doc, setDoc] = useState({ url: null, type: null });

  useEffect(() => {
    setDoc({ url: null, type: null });
    if (!bill?.id) return undefined;
    let url = null;
    let cancelled = false;
    billFile(bill.id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setDoc({ url, type: blob.type || bill.fileType || 'application/pdf' });
      })
      .catch(() => console.warn('Document preview not available for bill', bill.id));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bill?.id]);

  return doc;
}
