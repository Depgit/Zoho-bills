import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Loads a bill's file as an object URL (and frees it when the bill changes / unmounts).
// Returns { url, type } — url is null while loading or when there's no file.
export function useBillDocument(bill) {
  const [doc, setDoc] = useState({ url: null, type: null });

  useEffect(() => {
    setDoc({ url: null, type: null });
    if (!bill?._id) return undefined;
    let url = null;
    let cancelled = false;
    api
      .get(`/bills/${bill._id}/pdf`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        url = URL.createObjectURL(r.data);
        setDoc({ url, type: r.data.type || bill.fileType || 'application/pdf' });
      })
      .catch(() => console.warn('Document preview not available for bill', bill._id));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bill?._id]);

  return doc;
}
