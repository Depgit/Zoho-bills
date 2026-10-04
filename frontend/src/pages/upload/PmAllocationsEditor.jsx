import SearchSelect from '../../components/common/SearchSelect.jsx';
import { inr } from '../../utils/format.js';

// CM / OM / FM uploads: which PM(s) the bill belongs to, and how much each.
// Amounts must add up to the bill total; a new row is pre-filled with what's left.
export default function PmAllocationsEditor({ allocations = [], pms, total, setForm }) {
  const allocated = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const remaining = Math.round((total - allocated) * 100) / 100;
  const balanced = Math.abs(remaining) <= 1;

  const update = (fn) => setForm((prev) => ({ ...prev, allocations: fn(prev.allocations || []) }));
  const change = (i, key, value) => update((list) => list.map((a, j) => (j === i ? { ...a, [key]: value } : a)));
  const add = () => update((list) => [...list, { pmId: '', amount: remaining > 0 ? remaining : '' }]);
  const remove = (i) => update((list) => list.filter((_, j) => j !== i));

  return (
    <div style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}
      >
        <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700 }}>Property Manager(s) this bill belongs to *</h4>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: balanced ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)' }}>
          Allocated {inr(allocated)} of {inr(total)}
          {balanced ? ' ✓' : ` · ${remaining > 0 ? 'remaining' : 'over by'} ${inr(Math.abs(remaining))}`}
        </span>
      </div>

      {pms.length === 0 && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--warning, #f59e0b)', margin: '0 0 0.5rem' }}>
          No Property Managers are in your reporting line yet — ask the Admin to set up the hierarchy.
        </p>
      )}

      {allocations.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <SearchSelect style={{ flex: '1 1 220px' }} value={a.pmId} onChange={(e) => change(i, 'pmId', e.target.value)}>
            <option value="">— Property Manager —</option>
            {pms
              .filter((p) => p._id === a.pmId || !allocations.some((x) => x.pmId === p._id))
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                  {p.location_name ? ` · ${p.location_name}` : ''}
                </option>
              ))}
          </SearchSelect>
          <input
            className="form-control"
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount ₹"
            style={{ flex: '0 1 160px' }}
            value={a.amount}
            onChange={(e) => change(i, 'amount', e.target.value)}
          />
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}

      <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={pms.length === 0}>
        + Add Property Manager
      </button>
    </div>
  );
}

// Amount still to assign (positive) or over-assigned (negative)
export const remainingToAllocate = (allocations = [], total) =>
  Math.round((total - allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)) * 100) / 100;
