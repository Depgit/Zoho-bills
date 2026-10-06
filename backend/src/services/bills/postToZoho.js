// Push a bill to Zoho (FM approval, or an FM's own upload).
// Tax slab is automatic: vendor GSTIN state vs bill location state → GST / IGST;
// the FM can override per line (slabOverrides[i].tax_id).
import { orgsRepo } from '../../db/index.js';
import * as zoho from '../../integrations/zoho/index.js';
import { httpError } from '../../utils/httpError.js';
import { deleteFile, readFile } from '../files.service.js';
import { taxPlan } from '../gst.service.js';
import { vendorGstinOf } from '../vendors/index.js';
import { discountAccountOf, discountNote, discountTotal } from './discounts.js';
import { billSubtotal } from './total.js';

function applyTaxSlabs(b, taxes, slabOverrides) {
  (Array.isArray(slabOverrides) ? slabOverrides : []).forEach((o, i) => {
    if (b.lineItems[i] && o?.tax_id) b.lineItems[i].tax_id = o.tax_id;
  });
  const plan = taxPlan(b, taxes);
  b.lineItems.forEach((l) => {
    l.tax_id = plan.needsSlab(l) ? l.tax_id || plan.slabFor(l) : '';
  });
  const missing = b.lineItems.findIndex((l) => plan.needsSlab(l) && !l.tax_id);
  if (missing >= 0) {
    const pct = Number(b.lineItems[missing].tax_percentage) || 0;
    const kind = plan.interState === null ? 'GST / IGST' : plan.interState ? 'IGST' : 'GST';
    throw httpError(
      400,
      `Line ${missing + 1}: could not pick the ${kind} ${pct}% tax slab automatically` +
        (plan.interState === null ? ' (vendor or location state unknown)' : ` (no ${kind}${pct} slab in Zoho — create it under Settings → Taxes)`) +
        ' — please select it',
    );
  }
}

export async function postToZoho(b, slabOverrides) {
  b.vendorGstin = await vendorGstinOf(b.financeOrgId, b);
  const org = await orgsRepo.findById(b.financeOrgId);
  if (!org) throw httpError(500, 'Organisation not found for this bill');
  applyTaxSlabs(b, await zoho.taxes(org).catch(() => []), slabOverrides);

  try {
    // Zoho takes one bill-level discount: the rows' total; the rows themselves go into the notes
    const subtotal = billSubtotal(b);
    const note = discountNote(b, subtotal);
    b.zohoBillId = await zoho.createBill(org, {
      ...b,
      discount_amount: discountTotal(b, subtotal),
      discount_percent: 0,
      discount_account_id: discountAccountOf(b),
      ...(note ? { notes: `Discounts: ${note}` } : {}),
    });
  } catch (e) {
    throw httpError(502, 'Zoho: ' + (e.response?.data?.message || e.message));
  }
  try {
    // attach the PDF/image, then delete our copy
    await zoho.attach(org, b.zohoBillId, await readFile(b.pdfFile), b.fileType);
    deleteFile(b.pdfFile);
    b.pdfFile = null;
  } catch (e) {
    b.zohoError = 'Bill created; attachment failed: ' + e.message;
  }
  Object.assign(b, { status: 'POSTED', stage: '', approverId: null });
}
