import { useState } from 'react';
import Icon from '../../components/common/Icon.jsx';
import { inr } from '../../utils/format.js';

// Spend per expense account for the current filters (pick a property to see that property's
// expenses). Clicking a row filters the bills to that expense account.
export default function ExpenseSummary({ rows, accounts, selected, onSelect, propertyName }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  const nameOf = (id) => accounts.find((a) => a.account_id === id)?.account_name || (id ? `Account ${id}` : 'No account');
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <section className="panel">
      <button type="button" className="panel-head panel-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title">
          By expense{propertyName ? ` · ${propertyName}` : ''} <span className="count">{rows.length}</span>
        </span>
        <Icon name="chevronDown" size={16} className={open ? 'rot-180' : ''} />
      </button>
      {open && (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Expense account</th>
                <th className="num">Bills</th>
                <th className="num">Amount</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.accountId || 'none'}
                  className={`clickable ${selected === r.accountId ? 'selected' : ''}`}
                  onClick={() => r.accountId && onSelect(selected === r.accountId ? '' : r.accountId)}
                >
                  <td>
                    <b>{nameOf(r.accountId)}</b>
                  </td>
                  <td className="num">{r.count}</td>
                  <td className="num">
                    <b>{inr(r.amount)}</b>
                  </td>
                  <td className="num">
                    {total ? Math.round((r.amount / total) * 100) : 0}%
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
