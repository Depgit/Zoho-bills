import Icon from '../../components/common/Icon.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { isEditable } from '../../utils/billStatus.js';
import { inr } from '../../utils/format.js';

// Bills I own (newest first, paged), with Edit / Delete while they can still be changed
export default function MyBillsTable({ page, loading, onPage, onEdit, onDelete, onNavigateHistory }) {
  const rows = page?.rows || [];
  return (
    <section className={`panel ${loading ? 'is-loading' : ''}`}>
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="file" size={16} /> My recent bills <span className="count">{page?.total ?? 0}</span>
        </span>
        {onNavigateHistory && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onNavigateHistory}>
            Full history →
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty empty-sm">{loading ? 'Loading…' : 'No bills yet — upload an invoice above to get started.'}</div>
      ) : (
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Vendor</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th className="hide-md">Latest note</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const rejected = b.status === 'REJECTED';
                return (
                  <tr key={b.id} className={rejected ? 'row-attention' : undefined}>
                    <td data-label="Bill #">
                      <b>{b.billNumber || '—'}</b>
                    </td>
                    <td data-label="Vendor" className="truncate">
                      {b.vendorName || '—'}
                    </td>
                    <td data-label="Amount" className="num nowrap">
                      {inr(b.amount)}
                    </td>
                    <td data-label="Status">
                      <StatusBadge bill={b} />
                      {rejected && <div className="cell-sub text-danger">↩ Sent back to you — edit &amp; resubmit</div>}
                    </td>
                    <td data-label="Note" className="hide-md">
                      <span className={`note ${rejected ? 'note-danger' : ''}`}>{b.history?.at(-1)?.comment || '—'}</span>
                    </td>
                    <td className="actions">
                      {isEditable(b) && (
                        <>
                          <button type="button" className="icon-btn" onClick={() => onEdit(b)} title="Edit">
                            <Icon name="edit" size={15} />
                          </button>
                          <button type="button" className="icon-btn danger" onClick={() => onDelete(b)} title="Delete bill">
                            <Icon name="trash" size={15} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {page && page.total > page.pageSize && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={onPage} />}
    </section>
  );
}
