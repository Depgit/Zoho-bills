// Vendor memory: corrections users keep making get applied automatically
import { NORM } from './compare.js';
import { candidates, SAME_DOC_MIN } from './lookup.js';

const HINT_FIELDS = ['vendor_name', 'tax_percent']; // stable per vendor; invoice no/date/amount are not

// A field corrected to the same value >= minSeen times is reused.
// The same document uploaded again (re-upload / re-scan) gets its whole corrected result.
export async function getVendorHints(financeOrgId, { gstins, ocrText, aiGstin, aiInvoiceNo } = {}, minSeen = 2) {
  try {
    const { logs, own } = await candidates(financeOrgId, { gstins, ocrText });
    const hints = {};
    for (const field of HINT_FIELDS) {
      const tally = new Map();
      for (const l of logs) {
        const c = l.corrections?.[field];
        if (c && c.to != null && c.to !== '') tally.set(c.to, (tally.get(c.to) || 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= minSeen) hints[field] = top[0];
    }

    // Same document = near-identical text AND the AI read the same invoice no as last time
    // (another receipt from the same vendor can look almost identical but has its own number/date)
    const sameInvoice = (l) =>
      NORM.invoice_no(aiInvoiceNo) && NORM.invoice_no(l.aiOutput?.invoice_no) === NORM.invoice_no(aiInvoiceNo);
    const same = logs.find((l) => l._score >= SAME_DOC_MIN && l.finalOutput && sameInvoice(l));
    if (same) {
      for (const k of ['vendor_name', 'gstin', 'invoice_no', 'date', 'tax_percent']) {
        if (same.finalOutput[k] != null && same.finalOutput[k] !== '') hints[k] = same.finalOutput[k];
      }
    }

    // AI picked our own GSTIN as the seller's → take the learned one, or clear it
    if (!hints.gstin && own.includes(NORM.gstin(aiGstin))) {
      hints.gstin = logs.find((l) => l.vendorGstin && !own.includes(l.vendorGstin))?.vendorGstin || '';
    }
    return hints;
  } catch (e) {
    console.error('[learn] getVendorHints', e.message);
    return {};
  }
}

export const applyVendorHints = (ai, hints = {}) => ({ ...ai, ...hints });
