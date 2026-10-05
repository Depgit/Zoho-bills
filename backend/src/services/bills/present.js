// Shape bills for the frontend: add the vendor GSTIN and the GST/IGST decision
import { contactsRepo } from '../../db/index.js';
import { taxPlan } from '../gst.service.js';

export async function withTaxInfo(bills, financeOrgId) {
  const gstOf = await contactsRepo.gstMap(financeOrgId, bills.map((b) => b.vendorId));
  return bills.map((b) => {
    // Zoho contact first, else what OCR read off the bill
    const vendorGstin = gstOf[b.vendorId] || b.extracted?.gstin || '';
    const { hasGst, vendor, property, interState } = taxPlan({ ...b, vendorGstin }, []);
    return { ...b, vendorGstin, taxInfo: { hasGst, vendor, property, interState } };
  });
}
