import { useState } from 'react';
import Icon from '../../components/common/Icon.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';

// Left column: bills waiting, filterable by bill no / vendor / uploader
function QueueItem({ bill: b, active, showApprover, onOpen }) {
  const owner = b.ownerId || b.createdBy;
  return (
    <div onClick={() => onOpen(b)} className={`queue-item ${active ? 'active' : ''}`}>
      <div className="queue-item-top">
        <span className="queue-item-bill-no">{b.billNumber}</span>
        <StatusBadge bill={b} />
      </div>
      <div className="queue-item-vendor">{b.vendorName || 'Unnamed Vendor'}</div>
      <div className="queue-item-submitter">
        <Icon name="user" size={13} />
        By {owner?.name || '—'} ({owner?.role || '?'}){b.location_name ? ` · ${b.location_name}` : ''}
      </div>
      {showApprover && b.approverId?.name && (
        <div className="queue-item-submitter">
          Waiting on {b.approverId.name} ({b.stage})
        </div>
      )}
    </div>
  );
}

export default function QueueList({ title, bills, selectedId, showApprover, onOpen }) {
  const [filter, setFilter] = useState('');
  const q = filter.toLowerCase();
  const shown = bills.filter((b) =>
    [b.billNumber, b.vendorName, b.createdBy?.name].some((v) => (v || '').toLowerCase().includes(q)),
  );

  return (
    <div className="review-queue-card">
      <div className="review-queue-header">
        <div className="review-queue-title">
          <Icon name="clipboard" size={18} style={{ color: 'var(--primary)' }} />
          <span>{title}</span>
        </div>
        <span className="count-pill">{bills.length}</span>
      </div>

      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
        <input
          className="form-control"
          placeholder="Filter by bill #, vendor..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ fontSize: '0.8125rem', padding: '0.45rem 0.75rem' }}
        />
      </div>

      <div className="queue-items-list">
        {shown.length === 0 ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {bills.length === 0 ? 'No pending bills in queue' : 'No matching bills found'}
          </div>
        ) : (
          shown.map((b) => <QueueItem key={b._id} bill={b} active={selectedId === b._id} showApprover={showApprover} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}
