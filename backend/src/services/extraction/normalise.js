// Clean up an AI/regex result into one fixed shape, and merge helpers
import { VALID_GSTIN } from './config.js';

const num = (v) => Number(String(v ?? '').replace(/[₹,\s]/g, '')) || 0;

export function normalise(raw) {
  const r = raw || {};
  const allGstins = [
    ...new Set(
      [...(Array.isArray(r.gstins) ? r.gstins : []), ...(r.gstin ? [r.gstin] : [])]
        .filter((v) => typeof v === 'string' && VALID_GSTIN.test(v.trim()))
        .map((v) => v.trim().toUpperCase()),
    ),
  ];
  const gstin =
    typeof r.gstin === 'string' && VALID_GSTIN.test(r.gstin.trim()) ? r.gstin.trim().toUpperCase() : allGstins[0] || '';

  return {
    vendor_name: typeof r.vendor_name === 'string' ? r.vendor_name.replace(/^\s*Invoice\s*#?.*$/i, '').trim() : '',
    gstin,
    gstins: allGstins,
    invoice_no: String(r.invoice_no || '').trim(),
    date: r.date || '',
    tax_percent: num(r.tax_percent),
    tax_name: r.tax_name || '',
    tax_amount: num(r.tax_amount),
    discount_amount: num(r.discount_amount),
    discount_percent: num(r.discount_percent),
    total: num(r.total),
    line_items: Array.isArray(r.line_items)
      ? r.line_items
          .map((it) => ({
            name: String(it?.name || '').trim(),
            description: String(it?.description || '').trim(),
            hsn: String(it?.hsn || '').trim(),
            quantity: num(it?.quantity),
            rate: num(it?.rate),
            // the row's own GST %, else the invoice's (null when neither is known)
            tax_percent: it?.tax_percent !== undefined && it?.tax_percent !== '' && it?.tax_percent !== null ? num(it.tax_percent) : null,
          }))
          .filter((it) => it.name || it.rate)
      : [],
  };
}

// A result worth using / caching has at least some real content
export const isUseful = (d) => Boolean(d.gstin || d.invoice_no || d.total);

// Keep the AI values; fill only what they left empty from the regex parse
export function fillGaps(primary, ocr) {
  if (!ocr) return primary;
  const out = { ...primary };
  for (const k of ['gstin', 'invoice_no', 'date', 'tax_name', 'tax_percent', 'total']) {
    if (!out[k] && ocr[k]) out[k] = ocr[k];
  }
  out.gstins = [...new Set([...(out.gstins || []), ...(ocr.gstins || [])])];
  return out;
}
