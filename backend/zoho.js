import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { Contact } from './models.js';
const E = process.env;
let token, exp = 0;
async function getToken() {
  if (token && Date.now() < exp) return token;
  const r = await axios.post(`${E.ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
    params: {
      refresh_token: E.ZOHO_REFRESH_TOKEN, client_id: E.ZOHO_CLIENT_ID,
      client_secret: E.ZOHO_CLIENT_SECRET, grant_type: 'refresh_token'
    }
  });
  if (!r.data.access_token) throw new Error('Zoho token error: ' + JSON.stringify(r.data));
  token = r.data.access_token; exp = Date.now() + (r.data.expires_in - 120) * 1000;
  return token;
}
async function z(method, path, { params, data, headers } = {}) {
  const r = await axios({
    method, url: `${E.ZOHO_API_URL}/books/v3${path}`,
    params: { organization_id: E.ZOHO_ORG_ID, ...params }, data,
    headers: { Authorization: `Zoho-oauthtoken ${await getToken()}`, ...headers }
  });
  return r.data;
}
export async function fullSync() {
  const orgId = E.ZOHO_ORG_ID;
  await Contact.deleteMany({});
  let page = 1, more = true;
  while (more) {
    const res = await z('get', '/contacts', {
      params: { page, per_page: 200, contact_type: 'vendor' }
    });
    const ops = res.contacts.map(c => ({
      updateOne: {
        filter: { orgId, contact_id: c.contact_id },
        update: {
          $set: {
            orgId, contact_id: c.contact_id, contact_name: c.contact_name,
            gst_no: (c.gst_no || '').trim().toUpperCase(),
            status: c.status, last_modified_time: c.last_modified_time,
            synced_at: new Date()
          }
        },
        upsert: true
      }
    }));
    if (ops.length) await Contact.bulkWrite(ops);
    more = res.page_context?.has_more_page;
    page++;
  }
}

export const contacts = async (search) => {
  const q = search ? { contact_name: new RegExp(search, 'i') } : {};
  const list = await Contact.find(q);
  return list.map(c => ({ contact_id: c.contact_id, contact_name: c.contact_name, gst_no: c.gst_no }));
};
export const accounts = async () => (await z('get', '/chartofaccounts',
  { params: { filter_by: 'AccountType.Expense', per_page: 200 } })).chartofaccounts
  .map(a => ({ account_id: a.account_id, account_name: a.account_name }));
export const taxes = async () => (await z('get', '/settings/taxes', { params: { per_page: 200 } })).taxes
  .map(t => ({ tax_id: t.tax_id, tax_name: t.tax_name, tax_percentage: t.tax_percentage }));
export const locations = async () => (await z('get', '/locations')).locations
  .map(l => ({ location_id: l.location_id, location_name: l.location_name }));
export const createBill = async (b) => (await z('post', '/bills', {
  data: {
    vendor_id: b.vendorId, bill_number: b.billNumber, date: b.date, due_date: b.dueDate,
    ...(b.source_of_supply ? { source_of_supply: b.source_of_supply } : {}),
    ...(b.location_id ? { location_id: b.location_id } : {}),
    ...(b.discount_amount > 0 ? { discount: b.discount_amount, is_discount_before_tax: true, discount_type: 'entity_level' } : {}),
    line_items: b.lineItems.map(l => ({
      account_id: l.account_id, name: l.name, description: l.description || '',
      rate: l.rate, quantity: l.quantity, tax_id: l.tax_id
    }))
  }
})).bill.bill_id;
export const attach = async (billId, filePath, mimeType = 'application/pdf') => {
  const fd = new FormData();
  let ext = 'pdf';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = 'jpg';
  else if (mimeType?.includes('png')) ext = 'png';
  else if (mimeType?.includes('webp')) ext = 'webp';
  fd.append('attachment', fs.createReadStream(filePath), `invoice.${ext}`);
  await z('post', `/bills/${billId}/attachment`, { data: fd, headers: fd.getHeaders() });
};
