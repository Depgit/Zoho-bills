// Vendor contacts: synced from Zoho into the Contact collection, searched locally
import { Contact } from '../../models/index.js';
import { zohoRequest } from './request.js';

export async function fullSync(org) {
  await Contact.deleteMany({ financeOrgId: org._id });
  let page = 1;
  let more = true;
  while (more) {
    const res = await zohoRequest(org, 'get', '/contacts', {
      params: { page, per_page: 200, contact_type: 'vendor' },
    });
    const ops = res.contacts.map((c) => ({
      updateOne: {
        filter: { financeOrgId: org._id, contact_id: c.contact_id },
        update: {
          $set: {
            financeOrgId: org._id,
            contact_id: c.contact_id,
            contact_name: c.contact_name,
            gst_no: (c.gst_no || '').trim().toUpperCase(),
            status: c.status,
            last_modified_time: c.last_modified_time,
            synced_at: new Date(),
          },
        },
        upsert: true,
      },
    }));
    if (ops.length) await Contact.bulkWrite(ops);
    more = res.page_context?.has_more_page;
    page++;
  }
}

export async function contacts(org, search) {
  const q = { financeOrgId: org._id, ...(search ? { contact_name: new RegExp(search, 'i') } : {}) };
  const list = await Contact.find(q);
  return list.map((c) => ({ contact_id: c.contact_id, contact_name: c.contact_name, gst_no: c.gst_no }));
}

// Vendor GSTIN: Zoho contact first, else what OCR read off the bill
export async function vendorGstinOf(financeOrgId, bill) {
  const contact = await Contact.findOne({ financeOrgId, contact_id: bill.vendorId }, 'gst_no').lean();
  return contact?.gst_no || bill.extracted?.gstin || '';
}
