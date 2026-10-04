// What OCR + AI read off the invoice: vendor, GSTIN, total, tax %, discount
function Item({ label, children }) {
  return (
    <div className="extracted-item">
      <span className="extracted-item-label">{label}</span>
      {children}
    </div>
  );
}

export default function ExtractedSummary({ extracted: x }) {
  const hasTax = x.tax_percent !== undefined && x.tax_percent !== null;
  const hasDiscount = x.discount_amount > 0 || x.discount_percent > 0;
  return (
    <div className="extracted-banner">
      <div className="extracted-meta-group">
        <Item label="OCR Vendor:">
          <span className="extracted-item-val">{x.vendor_name || 'N/A'}</span>
        </Item>
        <Item label="GSTIN:">
          <span className="extracted-item-val" style={{ fontFamily: 'monospace' }}>
            {x.gstin || 'N/A'}
          </span>
        </Item>
        <Item label="OCR Invoice Total:">
          <span className="extracted-badge-total">{x.total || '0.00'}</span>
        </Item>
        {hasTax && (
          <Item label="Tax Rate:">
            <span className="extracted-item-val" style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
              {x.tax_percent}%
            </span>
          </Item>
        )}
        {hasDiscount && (
          <Item label="OCR Discount:">
            <span className="extracted-item-val" style={{ color: 'var(--warning, #f59e0b)' }}>
              {x.discount_amount > 0 ? `₹${x.discount_amount}` : `${x.discount_percent}%`}
            </span>
          </Item>
        )}
      </div>
    </div>
  );
}
