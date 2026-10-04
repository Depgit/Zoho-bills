import { taxDecisionText } from '../../utils/tax.js';

// Vendor GSTIN state vs bill location state → GST / IGST (decided automatically)
export default function TaxDecision({ bill: b }) {
  if (!b.taxInfo) return null;
  return (
    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <span>
        Vendor GSTIN: <b>{b.vendorGstin || 'none'}</b>
        {b.taxInfo.vendor && ` (${b.taxInfo.vendor})`}
      </span>
      <span>
        Property state: <b>{b.taxInfo.property || b.source_of_supply || 'not set'}</b>
      </span>
      <b style={{ color: 'var(--primary)' }}>{taxDecisionText(b.taxInfo)}</b>
    </div>
  );
}
