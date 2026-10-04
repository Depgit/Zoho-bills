import { lineAmount } from '../../utils/billMath.js';

// Line items with tax and line total, for the bill preview
export default function PreviewLineItems({ lines }) {
  if (!lines?.length) return null;
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Line Items</h4>
      <div className="table-responsive">
        <table className="custom-table" style={{ fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Qty × Rate</th>
              <th>Tax Rate</th>
              <th>Account</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const taxRate = Number(l.tax_percentage) || 0;
              const total = lineAmount(l) * (1 + taxRate / 100);
              return (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{l.name || 'Unnamed item'}</div>
                    {l.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.description}</div>}
                  </td>
                  <td>
                    {l.quantity} × ₹{Number(l.rate || 0).toLocaleString()}
                  </td>
                  <td>
                    <span className="badge badge-info">{taxRate}%</span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{l.account_id || '—'}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
