// Push a bill to Zoho (FM approval, or an FM's own upload).
// Tax slab is automatic: vendor GSTIN state vs bill location state → GST / IGST;
// the FM can override per line (slabOverrides[i].tax_id).
import { FinanceOrg } from '../../models/index.js';
import { httpError } from '../../utils/httpError.js';
import { deleteFile, readFile } from '../files.service.js';
import { taxPlan } from '../gst.service.js';
import * as zoho from '../zoho/index.js';

function applyTaxSlabs(b, taxes, slabOverrides) {
  (Array.isArray(slabOverrides) ? slabOverrides : []).forEach((o, i) => {
    if (b.lineItems[i] && o?.tax_id) b.lineItems[i].tax_id = o.tax_id;
  });
  const plan = taxPlan(b, taxes);
  b.lineItems.forEach((l) => {
    l.tax_id = plan.needsSlab(l) ? l.tax_id || plan.slabFor(l) : '';
  });
  b.markModified('lineItems');
  if (b.lineItems.some((l) => plan.needsSlab(l) && !l.tax_id)) {
    throw httpError(
      400,
      'Could not pick the tax slab automatically (vendor or location state unknown, or no matching slab in Zoho) — please select it',
    );
  }
}

export async function postToZoho(b, slabOverrides) {
  b.vendorGstin = await zoho.vendorGstinOf(b.financeOrgId, b);
  const org = await FinanceOrg.findById(b.financeOrgId);
  if (!org) throw httpError(500, 'Organisation not found for this bill');
  applyTaxSlabs(b, await zoho.taxes(org).catch(() => []), slabOverrides);

  try {
    b.zohoBillId = await zoho.createBill(org, b);
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
