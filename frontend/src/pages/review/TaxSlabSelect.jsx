import SearchSelect from '../../components/common/SearchSelect.jsx';
import { isIgst, slabLabel } from '../../utils/tax.js';

// Zoho tax slab for one line. "Suggested" = the line's tax % and, once the states are known,
// the right type (GST / IGST); everything else is listed below it.
export default function TaxSlabSelect({ line, taxes, interState, onChange }) {
  const pct = Number(line.tax_percentage) || 0;
  const fits = (t) => Number(t.tax_percentage) === pct && (interState === null || isIgst(t) === interState);
  const suggested = taxes.filter(fits);
  const others = taxes.filter((t) => !fits(t));
  const kind = interState === null ? '' : interState ? 'IGST ' : 'GST ';

  return (
    <SearchSelect
      style={{
        fontSize: '0.8125rem',
        padding: '0.35rem 0.5rem',
        minWidth: '190px',
        borderColor: !line.tax_id ? 'var(--warning, #f59e0b)' : 'var(--color-border)',
      }}
      value={line.tax_id || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— Select Tax Slab —</option>
      {suggested.length > 0 && (
        <optgroup label={`Suggested: ${kind}${pct}%`}>
          {suggested.map((t) => (
            <option key={t.tax_id} value={t.tax_id}>
              {slabLabel(t)}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={suggested.length > 0 ? 'Other Tax Slabs' : 'All Tax Slabs'}>
        {others.map((t) => (
          <option key={t.tax_id} value={t.tax_id}>
            {slabLabel(t)}
          </option>
        ))}
      </optgroup>
    </SearchSelect>
  );
}
