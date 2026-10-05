// Zoho tax slabs: same state → GST (CGST + SGST), different state → IGST
export const isIgst = (t) => t.tax_specific_type === 'igst' || /igst/i.test(t.tax_name || '');

// Slab for a tax % (0% → GST0 / IGST0) and GST/IGST
export const pickSlab = (taxes, pct, interState) =>
  taxes.find((t) => Number(t.tax_percentage) === (Number(pct) || 0) && isIgst(t) === interState)?.tax_id || '';

// With a vendor GSTIN every line needs a slab, 0% lines too (Zoho wants a tax or an exemption on each line)
export const needsSlab = (bill) => !!bill?.taxInfo?.hasGst;

// Auto-pick every line's slab from vendor state vs bill state (taxInfo from the API)
export const autoSlabs = (bill, taxes) => ({
  ...bill,
  lineItems: bill.lineItems.map((l) => {
    if (!needsSlab(bill, l)) return { ...l, tax_id: '' };
    if (bill.taxInfo.interState === null) return l;
    return { ...l, tax_id: pickSlab(taxes, l.tax_percentage, bill.taxInfo.interState) || l.tax_id };
  }),
});

// "No GSTIN on bill → no tax", "Same state → GST (CGST + SGST)", ...
export function taxDecisionText(taxInfo) {
  if (!taxInfo.hasGst) return 'No GSTIN on bill → no tax';
  if (taxInfo.interState === null) return 'State unknown → pick slab manually';
  return taxInfo.interState ? 'Different state → IGST' : 'Same state → GST (CGST + SGST)';
}

export const slabLabel = (t) => `${t.tax_name} (${t.tax_percentage}%)`;
