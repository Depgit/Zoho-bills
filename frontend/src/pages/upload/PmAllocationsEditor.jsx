import { useEffect } from 'react';
import SearchSelect from '../../components/common/SearchSelect.jsx';
import { splitEqually } from '../../utils/billMath.js';
import { inr } from '../../utils/format.js';

// CM / OM / FM uploads: which PM(s) the bill belongs to, and how much each.
// By default the total is shared equally between the chosen PMs (and re-shared when the total or
// the PMs change). Typing an amount switches to manual amounts; "Split equally" switches back.
export default function PmAllocationsEditor({ allocations = [], mode = 'equal', pms, total, setForm }) {
  const allocated = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const remaining = Math.round((total - allocated) * 100) / 100;
  const balanced = Math.abs(remaining) <= 1;
  const equal = mode === 'equal';

  const update = (fn, patch = {}) => setForm((prev) => ({ ...prev, ...patch, allocations: fn(prev.allocations || []) }));
  const shareEqually = (list) => {
    const shares = splitEqually(total, list.length);
    return list.map((a, i) => ({ ...a, amount: shares[i] }));
  };

  // Equal mode: keep the shares in step with the total and the number of PMs
  const key = `${total}:${allocations.length}`;
  useEffect(() => {
    if (!equal || !allocations.length) return;
    const shares = splitEqually(total, allocations.length);
    if (allocations.some((a, i) => Number(a.amount) !== shares[i])) update(shareEqually);
  }, [equal, key]);

  const changePm = (i, pmId) => update((list) => list.map((a, j) => (j === i ? { ...a, pmId } : a)));
  const changeAmount = (i, amount) => update((list) => list.map((a, j) => (j === i ? { ...a, amount } : a)), { allocationMode: 'manual' });
  const add = () => update((list) => (equal ? shareEqually([...list, { pmId: '' }]) : [...list, { pmId: '', amount: remaining > 0 ? remaining : '' }]));
  const remove = (i) => update((list) => {
    const rest = list.filter((_, j) => j !== i);
    return equal ? shareEqually(rest) : rest;
  });
  const backToEqual = () => update(shareEqually, { allocationMode: 'equal' });

  return (
    <div className="alloc">
      <div className="alloc-head">
        <h4>Property Manager(s) this bill belongs to *</h4>
        <span className={`alloc-status ${balanced ? 'ok' : 'warn'}`}>
          Allocated {inr(allocated)} of {inr(total)}
          {balanced ? ' ✓' : ` · ${remaining > 0 ? 'remaining' : 'over by'} ${inr(Math.abs(remaining))}`}
        </span>
      </div>
      <p className="alloc-hint">
        {equal ? 'Shared equally between the chosen Property Managers — type an amount to set it yourself.' : 'Amounts set by hand.'}
        {!equal && allocations.length > 0 && (
          <button type="button" className="link" onClick={backToEqual}>
            Split equally
          </button>
        )}
      </p>

      {pms.length === 0 && <p className="alloc-hint text-danger">No Property Managers are in your reporting line yet — ask the Admin to set up the hierarchy.</p>}

      {allocations.map((a, i) => (
        <div key={i} className="alloc-row">
          <SearchSelect style={{ flex: '1 1 220px' }} value={a.pmId} onChange={(e) => changePm(i, e.target.value)}>
            <option value="">— Property Manager —</option>
            {pms
              .filter((p) => p.id === a.pmId || !allocations.some((x) => x.pmId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.location_name ? ` · ${p.location_name}` : ''}
                </option>
              ))}
          </SearchSelect>
          <input
            className="form-control alloc-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount ₹"
            value={a.amount ?? ''}
            onChange={(e) => changeAmount(i, e.target.value)}
          />
          <button type="button" className="icon-btn danger" onClick={() => remove(i)} title="Remove">
            ✕
          </button>
        </div>
      ))}

      <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={pms.length === 0 || allocations.length >= pms.length}>
        + Add Property Manager
      </button>
    </div>
  );
}

// Amount still to assign (positive) or over-assigned (negative)
export const remainingToAllocate = (allocations = [], total) =>
  Math.round((total - allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)) * 100) / 100;
