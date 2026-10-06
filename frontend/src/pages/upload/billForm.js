// Building the bill form state from an extraction or from an existing bill
import { discountRows, isEqualSplit } from '../../utils/billMath.js';
import { idOf } from '../../utils/ids.js';

export const BLANK_LINE = { name: '', description: '', quantity: 1, rate: '', account_id: '', tax_percentage: 0, tax_id: '' };

const numberOr = (v, fallback) => (v !== undefined && v !== null && !isNaN(Number(v)) ? Number(v) : fallback);

// All extracted rows collapse into ONE line: rate = pre-tax total (qty × rate summed).
// The uploader can still add more lines by hand.
function collapsedLine(x) {
  const items = x.line_items || [];
  const sum = items.reduce((s, l) => s + (Number(l.quantity) || 1) * (Number(l.rate) || 0), 0);
  const fallback = Number(x.total) > 0 && Number(x.tax_amount) > 0 ? Number(x.total) - Number(x.tax_amount) : 0;
  const rate = Math.round((sum || fallback) * 100) / 100;
  return {
    ...BLANK_LINE,
    name: items.length > 1 ? `${items[0].name} + ${items.length - 1} more` : items[0]?.name || '',
    quantity: 1,
    rate: rate || '', // blank if nothing was read, so the uploader must fill it
    tax_percentage: numberOr(x.tax_percent, 0),
  };
}

// Discount rows from the extraction: deductions printed under the Sub Total, else the invoice's discount
function extractedDiscounts(x) {
  if (x.discounts?.length) return x.discounts.map((d) => ({ description: d.description || 'Deduction', type: 'amount', value: d.amount }));
  if (Number(x.discount_amount) > 0) return [{ description: 'Discount', type: 'amount', value: Number(x.discount_amount) }];
  if (Number(x.discount_percent) > 0) return [{ description: 'Discount', type: 'percent', value: Number(x.discount_percent) }];
  return [];
}

// New form from POST /bills/extract
export const formFromExtraction = (data, file, extracted, vendorId, lineItems, defaultLocationId) => ({
  pdfFile: data.pdfFile,
  fileType: data.fileType || file.type || 'application/pdf',
  extracted,
  vendorId,
  billNumber: extracted.invoice_no || '',
  date: extracted.date || '',
  dueDate: '',
  discounts: extractedDiscounts(extracted),
  lineItems,
  accountPicked: false,
  allocations: [],
  allocationMode: 'equal', // 'equal' = total shared equally between the chosen PMs; 'manual' = amounts typed by hand
  location_id: defaultLocationId || '', // preselected from the profile; can be changed
});

// One form line per invoice row when the PDF was read from its own text (pdftotext / pdf.js) —
// the table is exact then. Scans and photos (OCR) keep the single collapsed line: OCR'd tables
// are too unreliable to trust row by row.
export function extractedLines(x, { allItems = false } = {}) {
  const items = (x.line_items || []).filter((it) => it.name || Number(it.rate) > 0);
  if (!allItems || items.length < 2) return [collapsedLine(x)];
  return items.map((it) => ({
    ...BLANK_LINE,
    name: it.name || '',
    description: [it.hsn ? `HSN/SAC ${it.hsn}` : '', it.description || ''].filter(Boolean).join(' · '),
    quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
    rate: Number(it.rate) > 0 ? Math.round(Number(it.rate) * 100) / 100 : '',
    tax_percentage: numberOr(it.tax_percent, numberOr(x.tax_percent, 0)),
  }));
}

// Was this extraction read from the PDF's own text? (then every row can be trusted)
export const readFromPdfText = (res) => res?.extractMeta?.pdfPages?.mode === 'text' || Boolean(res?.extractMeta?.lineItems?.used);

// Edit form from an existing bill
export const formFromBill = (b, taxes, defaultLocationId) => ({
  pdfFile: b.pdfFile || '',
  fileType: b.fileType || 'application/pdf',
  extracted: b.extracted || {},
  vendorId: b.vendorId || '',
  billNumber: b.billNumber || '',
  date: b.date || '',
  dueDate: b.dueDate || '',
  discounts: discountRows(b).map((d) => ({ ...d })),
  lineItems: (b.lineItems?.length ? b.lineItems : [BLANK_LINE]).map((l) => ({
    ...BLANK_LINE,
    ...l,
    tax_percentage: numberOr(l.tax_percentage, taxes.find((t) => t.tax_id === l.tax_id)?.tax_percentage || 0),
  })),
  // existing bill with accounts already chosen → don't overwrite other lines
  accountPicked: (b.lineItems || []).some((l) => l.account_id),
  allocations: (b.allocations || []).map((a) => ({ pmId: idOf(a.pmId), amount: a.amount })),
  // Reopened bill: keep sharing equally only if it was an equal split
  allocationMode: isEqualSplit((b.allocations || []).map((a) => a.amount), b.total ?? (b.allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0))
    ? 'equal'
    : 'manual',
  location_id: b.location_id || defaultLocationId || '',
});

// "✓ Vendor auto-matched by GSTIN: X — PDF text read from all 9 page(s) · via gemini"
export function extractionMessage(data, extracted, matched) {
  if (data.warning) return `Note: ${data.warning}`;
  const match = matched
    ? matched.gst_no && matched.gst_no.toUpperCase() === (extracted.gstin || '').toUpperCase()
      ? `✓ Vendor auto-matched by GSTIN: ${matched.contact_name}`
      : `✓ Vendor matched by name: ${matched.contact_name}`
    : '';
  const pp = data.extractMeta?.pdfPages;
  const pages = pp
    ? pp.mode === 'text'
      ? `PDF text read from all ${pp.total ?? ''} page(s)${extracted.line_items?.length > 1 ? `, ${extracted.line_items.length} line items` : ''}`
      : `Scanned PDF, OCR on ${pp.mode === 'all' ? 'all pages' : 'first 2 + last 2'}${pp.read ? ` (${pp.read}/${pp.total ?? '?'} read)` : ''}`
    : '';
  const meta = data.extractMeta || {};
  const li = meta.lineItems;
  const table = li?.used ? `${li.rows} line item(s) read from the PDF table${li.matchesSubtotal ? ' — they add up to the Sub Total ✓' : ''}` : '';
  const source = meta.source === 'pdftotext' ? 'no AI needed' : meta.source && meta.source !== 'regex' ? `via ${meta.source}` : '';
  const aiFailed = meta.aiErrors && Object.keys(meta.aiErrors).length
    ? `⚠️ AI could not read this bill (${Object.entries(meta.aiErrors).map(([k, v]) => `${k}: ${v}`).join(', ')}) — check every field`
    : '';
  return [aiFailed, match, [pages, table, source].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
}

// Tax % choices: standard slabs + Zoho's + whatever was extracted
export function taxRateOptions(taxes, extracted) {
  const zohoRates = taxes.map((t) => Number(t.tax_percentage)).filter((p) => !isNaN(p));
  const extractedRate = numberOr(extracted?.tax_percent, null);
  return [...new Set([0, 5, 12, 18, 28, ...zohoRates, ...(extractedRate === null ? [] : [extractedRate])])].sort((a, b) => a - b);
}
