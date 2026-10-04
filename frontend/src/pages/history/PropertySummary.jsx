import { inr } from '../../utils/format.js';

const muted = { color: 'var(--text-muted)', fontSize: '0.8125rem' };

// Per-property totals; clicking a row filters the bills table to that property
export default function PropertySummary({ properties, selected, onSelect }) {
  if (!properties.length) return null;
  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <div className="card-header">
        <div className="card-title">
          By Property
          <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{properties.length}</span>
        </div>
        <div style={muted}>Click a row to filter the bills below</div>
      </div>
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Property Manager</th>
              <th>State</th>
              <th>Bills</th>
              <th>Approved &amp; Posted</th>
              <th>Pending</th>
              <th>Rejected</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr
                key={p.key}
                onClick={() => onSelect(selected === p.key ? 'ALL' : p.key)}
                style={{ cursor: 'pointer', background: selected === p.key ? 'var(--info-bg, rgba(59,130,246,0.06))' : undefined }}
              >
                <td style={{ fontWeight: 700 }}>{p.name}</td>
                <td>{p.pm}</td>
                <td>{p.state || '—'}</td>
                <td>{p.total}</td>
                <td>
                  <b>{p.posted}</b> <span style={muted}>· {inr(p.postedAmt)}</span>
                </td>
                <td>
                  {p.pending} <span style={muted}>· {inr(p.pendingAmt)}</span>
                </td>
                <td>{p.rejected}</td>
                <td>
                  <strong>{inr(p.totalAmt)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
