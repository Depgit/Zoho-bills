// Vendor contacts from Zoho (every page)
import { zohoRequest } from './request.js';

export async function fetchVendorContacts(org) {
  const out = [];
  for (let page = 1, more = true; more; page++) {
    const res = await zohoRequest(org, 'get', '/contacts', { params: { page, per_page: 200, contact_type: 'vendor' } });
    for (const c of res.contacts || []) {
      out.push({
        contact_id: c.contact_id,
        contact_name: c.contact_name,
        gst_no: (c.gst_no || '').trim().toUpperCase(),
        status: c.status,
        last_modified_time: c.last_modified_time,
      });
    }
    more = Boolean(res.page_context?.has_more_page);
  }
  return out;
}
