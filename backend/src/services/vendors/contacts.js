// Vendor contacts: synced from Zoho into the database, searched locally
import { contactsRepo } from '../../db/index.js';
import { fetchVendorContacts } from '../../integrations/zoho/index.js';

export const syncContacts = async (org) => contactsRepo.replaceAll(org.id, await fetchVendorContacts(org));

export const searchContacts = (org, text) => contactsRepo.search(org.id, text);

// Vendor GSTIN: Zoho contact first, else what OCR read off the bill
export const vendorGstinOf = async (financeOrgId, bill) =>
  (await contactsRepo.gstOf(financeOrgId, bill.vendorId)) || bill.extracted?.gstin || '';
