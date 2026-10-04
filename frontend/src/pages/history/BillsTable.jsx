import Icon from '../../components/common/Icon.jsx';
import BillRow from './BillRow.jsx';
import EmptyHistory from './EmptyHistory.jsx';

// The filtered bills, or an empty state
export default function BillsTable({ bills, totalCount, showManagerColumns, permissions, amountOf, filtersActive, canUpload, handlers }) {
  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="card-title">
          <Icon name="file" size={18} style={{ color: 'var(--primary)' }} />
          Submitted Invoices Record
          <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{bills.length}</span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Showing {bills.length} of {totalCount} invoices
        </div>
      </div>

      {bills.length === 0 ? (
        <EmptyHistory filtered={filtersActive} canUpload={canUpload} onReset={handlers.onReset} onNewEntry={handlers.onNew} />
      ) : (
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Bill / Invoice #</th>
                {showManagerColumns && <th>Property</th>}
                <th>Vendor</th>
                <th>Bill Date</th>
                <th>Calculated Total</th>
                <th>Status</th>
                {showManagerColumns && <th>Approval Trail</th>}
                <th>Review Note / Feedback</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <BillRow
                  key={b._id}
                  bill={b}
                  amount={amountOf(b)}
                  showManagerColumns={showManagerColumns}
                  canEdit={permissions.canEdit(b)}
                  canDelete={permissions.canDelete(b)}
                  {...handlers}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
