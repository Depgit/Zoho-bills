import { useState } from 'react';
import Icon from '../../components/common/Icon.jsx';
import SearchSelect from '../../components/common/SearchSelect.jsx';
import { ROLE_NAME } from '../../constants/roles.js';
import { DATE_PRESETS } from '../../utils/dates.js';
import { idOf } from '../../utils/ids.js';
import { buildChain, membersOf } from '../../utils/team.js';

const SORTS = [
  ['date:desc', 'Newest bill date'],
  ['date:asc', 'Oldest bill date'],
  ['amount:desc', 'Amount: high → low'],
  ['amount:asc', 'Amount: low → high'],
  ['updated:desc', 'Recently updated'],
];

// Search, date, sort and a "More filters" panel (team, property, stage, amount, custom dates, Zoho errors)
export default function FilterBar({ filters, team, properties, accounts, showTeam }) {
  const { f, set, update, setDate, setOm, setCm } = filters;
  const [open, setOpen] = useState(false);
  const chain = buildChain(team);
  const oms = membersOf(team, 'OM', chain);
  const cms = membersOf(team, 'CM', chain, f.om);
  const moreCount = [f.om, f.cm, f.pmId, f.accountId, f.stage && f.status === 'PENDING', f.minAmt, f.maxAmt, f.zohoError, f.date === 'CUSTOM'].filter(Boolean).length;

  const people = (role, list, value, onChange) =>
    list.length > 0 && (
      <label className="field">
        <span>{ROLE_NAME[role]}</span>
        <SearchSelect value={value} onChange={(e) => onChange(e.target.value)} className="input">
          <option value="">All</option>
          {list.map((u) => (
            <option key={idOf(u)} value={idOf(u)}>
              {u.name}
            </option>
          ))}
        </SearchSelect>
      </label>
    );

  return (
    <div className="filter-bar">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input
            className="input"
            placeholder={showTeam ? 'Search bill no., vendor, property, PM, note…' : 'Search bill no., vendor, note…'}
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
        <select className="input select-sm" value={f.date} onChange={(e) => setDate(e.target.value)} aria-label="Date range">
          {DATE_PRESETS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
          <option value="CUSTOM">Custom range…</option>
        </select>
        <select className="input select-sm" value={f.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
          {SORTS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className={`btn btn-secondary btn-sm ${open ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="filter" size={14} /> More filters{moreCount ? ` (${moreCount})` : ''}
        </button>
      </div>

      {open && (
        <div className="filter-panel">
          {showTeam && people('OM', oms, f.om, setOm)}
          {showTeam && people('CM', cms, f.cm, setCm)}
          {showTeam && (
            <label className="field">
              <span>Property</span>
              <SearchSelect value={f.pmId} onChange={(e) => update({ pmId: e.target.value })} className="input">
                <option value="">All properties</option>
                {properties.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                    {p.pm !== '—' ? ` · ${p.pm}` : ''}
                  </option>
                ))}
              </SearchSelect>
            </label>
          )}
          {showTeam && accounts.length > 0 && (
            <label className="field">
              <span>Expense account</span>
              <SearchSelect value={f.accountId} onChange={(e) => update({ accountId: e.target.value })} className="input">
                <option value="">All expenses</option>
                {accounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.account_name}
                  </option>
                ))}
              </SearchSelect>
            </label>
          )}
          {f.status === 'PENDING' && (
            <label className="field">
              <span>Waiting at</span>
              <select className="input" value={f.stage} onChange={(e) => update({ stage: e.target.value })}>
                <option value="">Any stage</option>
                <option value="CM">Cluster Manager</option>
                <option value="OM">Operations Manager</option>
                <option value="FM">Finance Manager</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>From</span>
            <input type="date" className="input" value={f.from} onChange={(e) => update({ from: e.target.value, date: 'CUSTOM' })} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" className="input" value={f.to} onChange={(e) => update({ to: e.target.value, date: 'CUSTOM' })} />
          </label>
          <label className="field">
            <span>Min amount (₹)</span>
            <input type="number" min="0" className="input" value={f.minAmt} onChange={(e) => update({ minAmt: e.target.value })} />
          </label>
          <label className="field">
            <span>Max amount (₹)</span>
            <input type="number" min="0" className="input" value={f.maxAmt} onChange={(e) => update({ maxAmt: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={f.zohoError} onChange={(e) => set({ zohoError: e.target.checked, page: 1 })} />
            Only bills with a Zoho error
          </label>
        </div>
      )}
    </div>
  );
}
