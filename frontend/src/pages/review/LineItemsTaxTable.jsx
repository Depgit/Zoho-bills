import { needsSlab, slabLabel } from '../../utils/tax.js';
import TaxSlabSelect from './TaxSlabSelect.jsx';

const mono = { fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)' };

// Bill lines with their tax. At the FM stage the Zoho tax slab can be changed per line.
export default function LineItemsTaxTable({ bill, taxes, editableSlabs, onSlabChange }) {
  const interState = bill.taxInfo?.interState ?? null;
  const slabName = (taxId) => {
    const t = taxes.find((x) => x.tax_id === taxId);
    return t ? slabLabel(t) : taxId || 'Set at FM approval';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: 'var(--text-secondary)' }}>Line Items Allocation</h4>
        {editableSlabs && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>* Tax slab is picked automatically — change it only if needed</span>
        )}
      </div>
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Item Description</th>
              <th>Qty × Rate</th>
              <th>Account Code</th>
              <th>Tax % (PM)</th>
              <th>Tax Slab (Zoho)</th>
            </tr>
          </thead>
          <tbody>
            {bill.lineItems.map((l, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{l.name || 'Unnamed item'}</td>
                <td>
                  {l.quantity} × ₹{Number(l.rate || 0).toLocaleString()}
                </td>
                <td>
                  <span style={mono}>{l.account_id || '—'}</span>
                </td>
                <td>
                  <span className="badge badge-info" style={{ fontWeight: 600 }}>
                    {l.tax_percentage != null ? `${l.tax_percentage}%` : '—'}
                  </span>
                </td>
                <td>
                  {!editableSlabs ? (
                    <span style={mono}>{slabName(l.tax_id)}</span>
                  ) : !needsSlab(bill, l) ? (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No GST</span>
                  ) : (
                    <TaxSlabSelect line={l} taxes={taxes} interState={interState} onChange={(taxId) => onSlabChange(i, taxId)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
