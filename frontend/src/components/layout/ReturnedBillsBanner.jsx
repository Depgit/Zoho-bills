import { useBills } from '../../hooks/useBills.js';

// Strip for the uploader when bills they own were rejected and are waiting on them to fix.
// Uses the cached "mine" list — updates by itself when a bill changes.
export default function ReturnedBillsBanner({ onOpen }) {
  const { rows } = useBills('mine');
  const count = rows.filter((b) => b.status === 'REJECTED').length;
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
