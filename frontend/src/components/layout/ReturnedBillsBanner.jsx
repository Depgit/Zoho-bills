import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

// Red strip for the uploader when bills they own were rejected and are waiting on them to fix.
// Re-checked whenever `refreshKey` changes (e.g. on tab switch).
export default function ReturnedBillsBanner({ refreshKey, onOpen }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    api
      .get('/bills', { params: { scope: 'mine' } })
      .then((r) => setCount((r.data || []).filter((b) => b.status === 'REJECTED').length))
      .catch((e) => console.warn('Could not check returned bills:', e));
  }, [refreshKey]);

  if (!count) return null;
  return (
    <div
      style={{
        background: 'rgba(239, 68, 68, 0.06)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
        padding: '0.6rem 2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        fontSize: '0.875rem',
        color: 'var(--danger-text)',
      }}
    >
      <span>
        ⚠️ {count} {count === 1 ? 'bill you uploaded was' : 'bills you uploaded were'} rejected and sent back to you for changes.
      </span>
      <button type="button" className="btn btn-outline-danger btn-sm" onClick={onOpen} style={{ marginLeft: 'auto' }}>
        Fix &amp; resubmit →
      </button>
    </div>
  );
}
