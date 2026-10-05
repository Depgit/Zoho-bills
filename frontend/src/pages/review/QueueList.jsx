import Icon from '../../components/common/Icon.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { uploadedBy } from '../../utils/billStatus.js';
import { inr } from '../../utils/format.js';

function QueueItem({ bill: b, active, checked, showApprover, onOpen, onToggle }) {
  return (
    <div className={`queue-item ${active ? 'active' : ''} ${checked ? 'checked' : ''}`}>
      <label className="queue-check" title="Select for bulk approval">
        <input type="checkbox" checked={checked} onChange={() => onToggle(b.id)} aria-label={`Select bill ${b.billNumber}`} />
      </label>
      <button type="button" className="queue-item-body" onClick={() => onOpen(b)}>
        <div className="queue-item-top">
          <span className="queue-item-bill-no">{b.billNumber || '—'}</span>
          <b className="queue-item-amount">{inr(b.amount)}</b>
        </div>
        <div className="queue-item-vendor truncate">{b.vendorName || 'Unnamed vendor'}</div>
        <div className="queue-item-meta">
          <span className="truncate">
            Uploaded by {uploadedBy(b)}
            {b.location_name ? ` · ${b.location_name}` : ''}
          </span>
          <span>{b.date}</span>
        </div>
        {showApprover && (
          <div className="queue-item-meta">
            <StatusBadge bill={b} />
          </div>
        )}
      </button>
    </div>
  );
}

// Left column: the queue — searched and paged in the browser; tick bills to approve several at once
export default function QueueList({ title, page, loading, search, onSearch, onPage, selectedId, showApprover, onOpen, checked, onToggle, allOnPage, onTogglePage }) {
  const rows = page?.rows || [];
  return (
    <aside className={`queue ${loading ? 'is-loading' : ''}`}>
      <div className="queue-head">
        <span className="panel-title">
          <Icon name="clipboard" size={16} /> {title} <span className="count">{page?.total ?? 0}</span>
        </span>
        {rows.length > 0 && (
          <label className="check queue-check-all">
            <input type="checkbox" checked={allOnPage} onChange={onTogglePage} /> Select all
          </label>
        )}
      </div>
      <div className="queue-search search">
        <Icon name="search" size={14} />
        <input className="input" placeholder="Search bill no., vendor, PM…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div className="queue-list">
        {rows.length === 0 ? (
          <div className="empty empty-sm">{loading ? 'Loading…' : search ? 'No matching bills' : 'Nothing waiting — all caught up'}</div>
        ) : (
          rows.map((b) => (
            <QueueItem
              key={b.id}
              bill={b}
              active={selectedId === b.id}
              checked={checked.has(b.id)}
              showApprover={showApprover}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))
        )}
      </div>
      {page && page.total > page.pageSize && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={onPage} />}
    </aside>
  );
}
