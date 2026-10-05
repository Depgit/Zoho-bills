import { useEffect, useState } from 'react';
import { listBills } from '../../api/bills.js';

// Strip for the uploader when bills they own were rejected and are waiting on them to fix.
// Re-checked whenever `refreshKey` changes (e.g. on tab switch) — asks the server for a count only.
export default function ReturnedBillsBanner({ refreshKey, onOpen }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    listBills({ scope: 'mine', status: 'REJECTED', pageSize: 10 })
      .then((r) => setCount(r.total))
      .catch((e) => console.warn('Could not check returned bills:', e));
  }, [refreshKey]);

  if (!count) return null;
  return (
    <div className="strip strip-danger">
      <span>
        ⚠️ {count} {count === 1 ? 'bill you uploaded was' : 'bills you uploaded were'} rejected and sent back to you for changes.
      </span>
      <button type="button" className="btn btn-danger-soft btn-sm" onClick={onOpen}>
        Fix &amp; resubmit →
      </button>
    </div>
  );
}
