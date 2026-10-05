import Icon from '../../components/common/Icon.jsx';

// Shown while bills are ticked in the queue: approve them all at once
export default function BulkApproveBar({ count, busy, onApprove, onClear }) {
  if (!count) return null;
  return (
    <div className="bulk-bar" role="region" aria-label="Bulk approve">
      <span>
        <b>{count}</b> bill{count === 1 ? '' : 's'} selected
      </span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={busy}>
        Clear
      </button>
      <button type="button" className="btn btn-success btn-sm" onClick={onApprove} disabled={busy}>
        <Icon name="check" size={15} /> {busy ? 'Approving…' : `Approve ${count}`}
      </button>
    </div>
  );
}
