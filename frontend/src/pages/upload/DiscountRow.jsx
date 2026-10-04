import Icon from '../../components/common/Icon.jsx';
import { inr } from '../../utils/format.js';

const label = { fontSize: '0.8125rem', color: 'var(--text-muted)' };

// Bill-level discount: a flat ₹ amount or a % of the subtotal (taken off after tax)
export default function DiscountRow({ form, set, discount }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        marginTop: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'var(--color-surface-subtle, rgba(99,102,241,0.05))',
        borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--color-border)',
      }}
    >
      <Icon name="tag" size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Discount on bill:</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={label}>₹</span>
        <input
          type="number"
          step="0.01"
          min="0"
          className="form-control"
          style={{ maxWidth: 130 }}
          placeholder="Flat amount"
          value={form.discount_amount || ''}
          onChange={(e) => set('discount_amount', +e.target.value || 0)}
        />
      </div>
      <span style={label}>or</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="form-control"
          style={{ maxWidth: 100 }}
          placeholder="% off"
          value={form.discount_percent || ''}
          onChange={(e) => set('discount_percent', +e.target.value || 0)}
        />
        <span style={label}>%</span>
      </div>
      {discount > 0 && (
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--success, #22c55e)', whiteSpace: 'nowrap' }}>
          − {inr(discount)} off
        </span>
      )}
    </div>
  );
}
