import { inr } from '../../utils/format.js';

// Which PM(s) the bill belongs to, for the bill preview
export default function PreviewAllocations({ bill: b }) {
  if (!b.allocations?.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
        Property Manager(s) · uploaded by {b.createdBy?.name || '—'} ({b.createdBy?.role || '?'})
      </h4>
      {b.allocations.map((a, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.2rem 0' }}>
          <span>
            {a.pmId?.name || '—'}
            {a.pmId?.location_name ? ` · ${a.pmId.location_name}` : ''}
          </span>
          <strong>{inr(a.amount)}</strong>
        </div>
      ))}
    </div>
  );
}
