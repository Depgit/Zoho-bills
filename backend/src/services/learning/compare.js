// Compare what the AI read with what was finally submitted, field by field
const FIELDS = ['vendor_name', 'gstin', 'invoice_no', 'date', 'tax_percent', 'subtotal'];

function parseDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // Indian dd/mm/yyyy
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Normalisers so cosmetic differences don't count as corrections
export const NORM = {
  vendor_name: (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  gstin: (v) => String(v || '').toUpperCase().replace(/\s+/g, ''),
  invoice_no: (v) => String(v || '').toUpperCase().replace(/\s+/g, ''),
  date: parseDate,
  tax_percent: toNumber,
  subtotal: (v) => {
    const n = toNumber(v);
    return n === null ? null : Math.round(n * 100) / 100;
  },
};

const sumItems = (items) =>
  (Array.isArray(items) ? items : []).reduce((s, i) => s + (Number(i.quantity ?? i.qty) || 0) * (Number(i.rate) || 0), 0);

// AI output → comparable shape
export const fromAi = (a = {}) => ({
  vendor_name: a.vendor_name,
  gstin: a.gstin,
  invoice_no: a.invoice_no,
  date: a.date,
  tax_percent: a.tax_percent,
  subtotal: sumItems(a.line_items),
});

// Bill document → comparable shape
export const fromBill = (b = {}, vendorGstin = '') => ({
  vendor_name: b.vendorName,
  gstin: vendorGstin || b.vendorGstin,
  invoice_no: b.billNumber,
  date: b.date,
  tax_percent: b.lineItems?.[0]?.tax_percentage,
  subtotal: sumItems(b.lineItems || []),
});

// { field: { from, to } } for every field that differs
export function diffFields(ai, final) {
  const out = {};
  for (const k of FIELDS) {
    if (NORM[k](ai[k]) !== NORM[k](final[k])) out[k] = { from: ai[k] ?? null, to: final[k] ?? null };
  }
  return out;
}
