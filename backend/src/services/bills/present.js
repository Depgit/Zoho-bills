// Shape bills for the frontend: add the vendor GSTIN and the GST/IGST decision
import { Contact } from '../../models/index.js';
import { taxPlan } from '../gst.service.js';

export async function withTaxInfo(bills, financeOrgId) {
  const vendorIds = [...new Set(bills.map((b) => b.vendorId).filter(Boolean))];
  const contacts = await Contact.find({ financeOrgId, contact_id: { $in: vendorIds } }, 'contact_id gst_no').lean();
  const gstOf = Object.fromEntries(contacts.map((c) => [c.contact_id, c.gst_no]));
  return bills.map((b) => {
    // Zoho contact first, else what OCR read off the bill
    const vendorGstin = gstOf[b.vendorId] || b.extracted?.gstin || '';
    const { hasGst, vendor, property, interState } = taxPlan({ ...b, vendorGstin }, []);
    return { ...b, vendorGstin, taxInfo: { hasGst, vendor, property, interState } };
  });
}
