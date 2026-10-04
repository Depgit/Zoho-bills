import Icon from '../../components/common/Icon.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { isEditable } from '../../utils/billStatus.js';

// Bills the user owns, with Edit / Delete while they can still be changed
export default function MyBillsTable({ bills, onEdit, onDelete, onNavigateHistory }) {
  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="card-title">
          <Icon name="file" size={20} style={{ color: 'var(--primary)' }} />
          My Recent Submissions
          <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{bills.length}</span>
        </div>
        {onNavigateHistory && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateHistory}>
            📜 View Full History &amp; Analytics →
          </button>
        )}
      </div>

      {bills.length === 0 ? (
        <div className="pdf-fallback" style={{ borderRadius: 'var(--radius-md)' }}>
          <Icon name="alertCircle" size={40} strokeWidth={1.5} style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }} />
          <p>No bills submitted yet. Upload a vendor invoice above to get started.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Bill Number</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Latest Review Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b._id} style={b.status === 'REJECTED' ? { background: 'rgba(239, 68, 68, 0.04)' } : undefined}>
                  <td>
                    <strong style={{ color: 'var(--primary)' }}>{b.billNumber}</strong>
                  </td>
                  <td>{b.vendorName}</td>
                  <td>
                    <StatusBadge bill={b} />
                  </td>
                  <td style={{ color: b.status === 'REJECTED' ? 'var(--danger-text)' : 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                    {b.history?.at(-1)?.comment || '—'}
                    {b.status === 'REJECTED' && <div style={{ fontWeight: 600 }}>↩ Sent back to you — edit &amp; resubmit</div>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isEditable(b) && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => onEdit(b)} style={{ whiteSpace: 'nowrap' }}>
                          ✏️ Edit
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => onDelete(b)}
                          style={{ whiteSpace: 'nowrap', marginLeft: '0.4rem' }}
                          title="Delete bill and make a fresh entry"
                        >
                          🗑️ Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
