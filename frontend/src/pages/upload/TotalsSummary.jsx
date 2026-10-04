import { inr } from '../../utils/format.js';

// Subtotal, discount, total incl. tax — compared against the OCR total
export default function TotalsSummary({ subtotal, discount, total, ocrTotal }) {
  const parsedOcr = parseFloat(String(ocrTotal || '').replace(/[^0-9.]/g, '')) || 0;
  const matches = Math.abs(total - parsedOcr) < 1;
  return (
    <div className="computation-summary-card">
      <div>
        <span className="computation-label">Subtotal (before discount):</span>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{inr(subtotal)}</div>
        {discount > 0 && <div style={{ fontSize: '0.8125rem', color: 'var(--success, #22c55e)' }}>− {inr(discount)} discount</div>}
        <span className="computation-label" style={{ marginTop: '0.25rem', display: 'block' }}>
          Calculated Total (incl. taxes):
        </span>
        <div className="computation-total-val">{inr(total)}</div>
      </div>

      {ocrTotal && (
        <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: '1rem' }}>
          <span className="computation-label">Invoice OCR Total:</span>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{ocrTotal}</div>
          <span className={`computation-match-pill ${matches ? 'match' : 'diff'}`}>{matches ? '✓ Totals Match' : '⚠ Discrepancy'}</span>
        </div>
      )}
    </div>
  );
}
