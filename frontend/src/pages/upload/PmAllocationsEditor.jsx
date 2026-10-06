import { useEffect } from 'react';
import MultiSelect from '../../components/common/MultiSelect.jsx';
import { splitEqually } from '../../utils/billMath.js';
import { inr } from '../../utils/format.js';
import { fillAllocations } from './allocations.js';

// CM / OM / FM uploads: which PM(s) the bill belongs to, and how much each.
// PMs are picked in one checklist (search, Select all, Clear). By default the total is shared equally
// between them (and re-shared when the total or the PMs change). Typing an amount switches to manual
// amounts; "Split equally" switches back.
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

  // Keep the amounts in step with the total and the number of PMs:
  //   one PM → always the whole total (in any mode);  equal mode → equal shares
  const key = `${total}:${allocations.length}`;
  useEffect(() => {
    if (!allocations.length) return;
    const round = Math.round(total * 100) / 100;
    if (allocations.length === 1) {
      if (Number(allocations[0].amount) !== round) update((list) => [{ ...list[0], amount: round }]);
      return;
    }
    if (!equal) return;
    const shares = splitEqually(total, allocations.length);
    if (allocations.some((a, i) => Number(a.amount) !== shares[i])) update(shareEqually);
  }, [equal, key]);

  const fill = (list) => fillAllocations(list, total, equal);

  // The checklist changed: keep the amounts of PMs still chosen, add the new ones (equal mode re-shares)
  const choose = (ids) =>
    update((list) => {
      const byPm = new Map(list.map((a) => [a.pmId, a]));
      return fill(ids.map((pmId) => byPm.get(pmId) || { pmId, amount: '' }));
    });
  const nameOf = (pmId) => pms.find((p) => p.id === pmId);
  const changeAmount = (i, amount) => update((list) => list.map((a, j) => (j === i ? { ...a, amount } : a)), { allocationMode: 'manual' });
  const remove = (i) => update((list) => fill(list.filter((_, j) => j !== i)));
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

      <MultiSelect
        options={pms.map((p) => ({ value: p.id, label: p.name, sub: p.location_name }))}
        value={allocations.map((a) => a.pmId).filter(Boolean)}
        onChange={choose}
        placeholder="Choose Property Managers…"
        disabled={pms.length === 0}
      />

      {allocations.length > 0 && (
        <div className="alloc-list">
          {allocations.map((a, i) => (
            <div key={a.pmId || i} className="alloc-row">
              <span className="alloc-name">
                <b>{nameOf(a.pmId)?.name || 'Unknown PM'}</b>
                {nameOf(a.pmId)?.location_name && <span className="muted"> · {nameOf(a.pmId).location_name}</span>}
              </span>
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
        </div>
      )}
    </div>
  );
}

// Amount still to assign (positive) or over-assigned (negative)
export const remainingToAllocate = (allocations = [], total) =>
  Math.round((total - allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)) * 100) / 100;
