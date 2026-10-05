import Icon from '../../components/common/Icon.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { uploadedBy } from '../../utils/billStatus.js';
import { inr } from '../../utils/format.js';

function QueueItem({ bill: b, active, showApprover, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(b)} className={`queue-item ${active ? 'active' : ''}`}>
      <div className="queue-item-top">
        <span className="queue-item-bill-no">{b.billNumber || '—'}</span>
        <b className="queue-item-amount">{inr(b.amount)}</b>
      </div>
      <div className="queue-item-vendor truncate">{b.vendorName || 'Unnamed vendor'}</div>
      <div className="queue-item-meta">
        <span className="truncate">
          Uploaded by {uploadedBy(b)}{b.location_name ? ` · ${b.location_name}` : ''}
        </span>
        <span>{b.date}</span>
      </div>
      {showApprover && (
        <div className="queue-item-meta">
          <StatusBadge bill={b} />
        </div>
      )}
    </button>
  );
}

// Left column: the queue, searched and paged by the server
export default function QueueList({ title, page, loading, search, onSearch, onPage, selectedId, showApprover, onOpen }) {
  const rows = page?.rows || [];
  return (
    <aside className={`queue ${loading ? 'is-loading' : ''}`}>
      <div className="queue-head">
        <span className="panel-title">
          <Icon name="clipboard" size={16} /> {title} <span className="count">{page?.total ?? 0}</span>
        </span>
      </div>
      <div className="queue-search search">
        <Icon name="search" size={14} />
        <input className="input" placeholder="Search bill no., vendor, PM…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div className="queue-list">
        {rows.length === 0 ? (
          <div className="empty empty-sm">{loading ? 'Loading…' : search ? 'No matching bills' : 'Nothing waiting — all caught up'}</div>
        ) : (
          rows.map((b) => <QueueItem key={b.id} bill={b} active={selectedId === b.id} showApprover={showApprover} onOpen={onOpen} />)
        )}
      </div>
      {page && page.total > page.pageSize && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={onPage} />}
    </aside>
  );
}
