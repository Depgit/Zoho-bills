import { inr } from '../../utils/format.js';

// Which PM(s) the bill belongs to and their amounts
export default function AllocationsTable({ bill: b }) {
  if (!b.allocations?.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-secondary)' }}>
        Property Manager(s) · uploaded by {b.createdBy?.name || '—'} ({b.createdBy?.role || '?'})
      </h4>
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Property Manager</th>
              <th>Property</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {b.allocations.map((a, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{a.pmId?.name || '—'}</td>
                <td>{a.pmId?.location_name || '—'}</td>
                <td style={{ textAlign: 'right' }}>{inr(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
