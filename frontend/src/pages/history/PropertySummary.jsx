import { useState } from 'react';
import Icon from '../../components/common/Icon.jsx';
import { inr } from '../../utils/format.js';

// Per-property totals (collapsible); clicking a row filters the bills to that property
export default function PropertySummary({ properties, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  if (!properties.length) return null;
  return (
    <section className="panel">
      <button type="button" className="panel-head panel-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title">
          By property <span className="count">{properties.length}</span>
        </span>
        <Icon name="chevronDown" size={16} className={open ? 'rot-180' : ''} />
      </button>
      {open && (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Property</th>
                <th>Property Manager</th>
                <th className="num">Bills</th>
                <th className="num">Posted</th>
                <th className="num">Pending</th>
                <th className="num">Rejected</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.key} className={`clickable ${selected === p.key ? 'selected' : ''}`} onClick={() => onSelect(selected === p.key ? '' : p.key)}>
                  <td data-label="Property">
                    <b>{p.name}</b>
                    {p.state && <span className="muted"> · {p.state}</span>}
                  </td>
                  <td data-label="PM">{p.pm}</td>
                  <td data-label="Bills" className="num">
                    {p.total}
                  </td>
                  <td data-label="Posted" className="num">
                    {p.posted} <span className="muted">{inr(p.postedAmt)}</span>
                  </td>
                  <td data-label="Pending" className="num">
                    {p.pending} <span className="muted">{inr(p.pendingAmt)}</span>
                  </td>
                  <td data-label="Rejected" className="num">
                    {p.rejected}
                  </td>
                  <td data-label="Total" className="num">
                    <b>{inr(p.totalAmt)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
