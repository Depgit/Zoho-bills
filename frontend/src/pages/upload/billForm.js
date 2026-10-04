// Building the bill form state from an extraction or from an existing bill
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

// New form from POST /bills/extract
export const formFromExtraction = (data, file, extracted, vendorId, lineItems, defaultLocationId) => ({
  pdfFile: data.pdfFile,
  fileType: data.fileType || file.type || 'application/pdf',
  extracted,
  vendorId,
  billNumber: extracted.invoice_no || '',
  date: extracted.date || '',
  dueDate: '',
  discount_amount: extracted.discount_amount || 0,
  discount_percent: extracted.discount_percent || 0,
  lineItems,
  accountPicked: false,
  allocations: [],
  location_id: defaultLocationId || '', // preselected from the profile; can be changed
});

export const extractedLines = (x) => [collapsedLine(x)];

// Edit form from an existing bill
export const formFromBill = (b, taxes, defaultLocationId) => ({
  pdfFile: b.pdfFile || '',
  fileType: b.fileType || 'application/pdf',
  extracted: b.extracted || {},
  vendorId: b.vendorId || '',
  billNumber: b.billNumber || '',
  date: b.date || '',
  dueDate: b.dueDate || '',
  discount_amount: b.discount_amount || 0,
  discount_percent: b.discount_percent || 0,
  lineItems: (b.lineItems?.length ? b.lineItems : [BLANK_LINE]).map((l) => ({
    ...BLANK_LINE,
    ...l,
    tax_percentage: numberOr(l.tax_percentage, taxes.find((t) => t.tax_id === l.tax_id)?.tax_percentage || 0),
  })),
  // existing bill with accounts already chosen → don't overwrite other lines
  accountPicked: (b.lineItems || []).some((l) => l.account_id),
  allocations: (b.allocations || []).map((a) => ({ pmId: idOf(a.pmId), amount: a.amount })),
  location_id: b.location_id || defaultLocationId || '',
});

// "✓ Vendor auto-matched by GSTIN: X — PDF: first 2 + last 2 (4/9 read) · via gemini"
export function extractionMessage(data, extracted, matched) {
  if (data.warning) return `Note: ${data.warning}`;
  const match = matched
    ? matched.gst_no && matched.gst_no.toUpperCase() === (extracted.gstin || '').toUpperCase()
      ? `✓ Vendor auto-matched by GSTIN: ${matched.contact_name}`
      : `✓ Vendor matched by name: ${matched.contact_name}`
    : '';
  const pp = data.extractMeta?.pdfPages;
  const pages = pp
    ? `PDF: ${pp.mode === 'all' ? 'all pages' : 'first 2 + last 2'}${pp.read ? ` (${pp.read}/${pp.total ?? '?'} read)` : ''}`
    : '';
  const source = data.extractMeta?.source ? `via ${data.extractMeta.source}` : '';
  return [match, [pages, source].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
}

// Tax % choices: standard slabs + Zoho's + whatever was extracted
export function taxRateOptions(taxes, extracted) {
  const zohoRates = taxes.map((t) => Number(t.tax_percentage)).filter((p) => !isNaN(p));
  const extractedRate = numberOr(extracted?.tax_percent, null);
  return [...new Set([0, 5, 12, 18, 28, ...zohoRates, ...(extractedRate === null ? [] : [extractedRate])])].sort((a, b) => a - b);
}
