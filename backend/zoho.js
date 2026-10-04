import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { Contact } from './models.js';
import { gstinState, stateCode } from './gst.js';
import { constants } from 'crypto';
import https from "https";

// Relaxed TLS agent for Zoho (fixes ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR / alert 80)
const zohoAgent = new https.Agent({
  ciphers: 'DEFAULT:@SECLEVEL=0',
  minVersion: 'TLSv1.2',
  // Only needed if you ALSO see "unsafe legacy renegotiation disabled"
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

// A pre-configured axios instance that uses the agent
const zohoHttp = axios.create({ httpsAgent: zohoAgent });

// Per-org token cache: orgId (string) -> { token, exp }
const tokenCache = {};

async function getToken(org) {
  const key = String(org._id);
  const cached = tokenCache[key];
  if (cached && Date.now() < cached.exp) return cached.token;
  const r = await zohoHttp.post(`${org.zohoAccountsUrl}/oauth/v2/token`, null, {
    params: {
      refresh_token: org.zohoRefreshToken,
      client_id: org.zohoClientId,
      client_secret: org.zohoClientSecret,
      grant_type: 'refresh_token'
    }
  });
  if (!r.data.access_token) throw new Error('Zoho token error: ' + JSON.stringify(r.data));
  tokenCache[key] = { token: r.data.access_token, exp: Date.now() + (r.data.expires_in - 120) * 1000 };
  return tokenCache[key].token;
}

// async function z(org, method, path, { params, data, headers } = {}) {
//   const r = await axios({
//     method,
//     url: `${org.zohoApiUrl}/books/v3${path}`,
//     params: { organization_id: org.zohoOrgId, ...params },
//     data,
//     headers: { Authorization: `Zoho-oauthtoken ${await getToken(org)}`, ...headers }
//   });
//   return r.data;
// }
async function z(org, method, path, { params, data, headers } = {}) {
  const r = await zohoHttp({
    method,
    url: `${org.zohoApiUrl}/books/v3${path}`,
    params: { organization_id: org.zohoOrgId, ...params },
    data,
    headers: { Authorization: `Zoho-oauthtoken ${await getToken(org)}`, ...headers }
  });
  return r.data;
}

/**
 * Validate that the given credentials can successfully get a Zoho token and
 * retrieve the org's organisation name. Returns the org display name on success.
 */
// export async function validateZohoCredentials({ zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId, zohoAccountsUrl, zohoApiUrl }) {
//   const accountsUrl = zohoAccountsUrl || 'https://accounts.zoho.in';
//   const apiUrl = zohoApiUrl || 'https://www.zohoapis.in';
//   // Step 1: Get an access token
//   const tokenRes = await zohoHttp.post(`${accountsUrl}/oauth/v2/token`, null, {
//     params: { refresh_token: zohoRefreshToken, client_id: zohoClientId, client_secret: zohoClientSecret, grant_type: 'refresh_token' }
//   });
//   if (!tokenRes.data.access_token) throw new Error('Could not obtain Zoho access token. Check Client ID, Secret, and Refresh Token.');
//   const accessToken = tokenRes.data.access_token;
//   // Step 2: Fetch the organisation details to confirm orgId is valid
//   const orgRes = await zohoHttp.get(`${apiUrl}/books/v3/organizations`, {
//     headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
//   });
//   const orgs = orgRes.data?.organizations || [];
//   const matched = orgs.find(o => String(o.organization_id) === String(zohoOrgId));
//   if (!matched) throw new Error(`Org ID "${zohoOrgId}" not found in this Zoho account. Available: ${orgs.map(o => o.organization_id).join(', ')}`);
//   return matched.name || matched.organization_name || matched.organization_id;
// }

export async function validateZohoCredentials({ zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId, zohoAccountsUrl, zohoApiUrl }) {
  const accountsUrl = zohoAccountsUrl || 'https://accounts.zoho.in';
  const apiUrl = zohoApiUrl || 'https://www.zohoapis.in';

  const tokenRes = await zohoHttp.post(`${accountsUrl}/oauth/v2/token`, null, {
    params: { refresh_token: zohoRefreshToken, client_id: zohoClientId, client_secret: zohoClientSecret, grant_type: 'refresh_token' }
  });
  if (!tokenRes.data.access_token) throw new Error('Could not obtain Zoho access token. Check Client ID, Secret, and Refresh Token.');
  const accessToken = tokenRes.data.access_token;

  const orgRes = await zohoHttp.get(`${apiUrl}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
  });
  const orgs = orgRes.data?.organizations || [];
  const matched = orgs.find(o => String(o.organization_id) === String(zohoOrgId));
  if (!matched) throw new Error(`Org ID "${zohoOrgId}" not found in this Zoho account. Available: ${orgs.map(o => o.organization_id).join(', ')}`);
  return matched.name || matched.organization_name || matched.organization_id;
}

export async function fullSync(org) {
  await Contact.deleteMany({ financeOrgId: org._id });
  let page = 1, more = true;
  while (more) {
    const res = await z(org, 'get', '/contacts', { params: { page, per_page: 200, contact_type: 'vendor' } });
    const ops = res.contacts.map(c => ({
      updateOne: {
        filter: { financeOrgId: org._id, contact_id: c.contact_id },
        update: {
          $set: {
            financeOrgId: org._id,
            contact_id: c.contact_id, contact_name: c.contact_name,
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

export const contacts = async (org, search) => {
  const q = { financeOrgId: org._id, ...(search ? { contact_name: new RegExp(search, 'i') } : {}) };
  const list = await Contact.find(q);
  return list.map(c => ({ contact_id: c.contact_id, contact_name: c.contact_name, gst_no: c.gst_no }));
};

export const accounts = async (org) => (await z(org, 'get', '/chartofaccounts',
  { params: { filter_by: 'AccountType.Expense', per_page: 200 } })).chartofaccounts
  .map(a => ({ account_id: a.account_id, account_name: a.account_name }));

export const taxes = async (org) => (await z(org, 'get', '/settings/taxes', { params: { per_page: 200 } })).taxes
  .map(t => ({ tax_id: t.tax_id, tax_name: t.tax_name, tax_percentage: t.tax_percentage }));

export const locations = async (org) => (await z(org, 'get', '/locations')).locations
  .map(l => ({ location_id: l.location_id, location_name: l.location_name }));

// Zoho needs an account to book a bill-level discount into — use the org's
// account named "Discount" (cached per org)
const discountAcctCache = {};
const discountAccount = async (org) => {
  const key = String(org._id);
  if (!discountAcctCache[key]) {
    const list = (await z(org, 'get', '/chartofaccounts', { params: { per_page: 200 } })).chartofaccounts || [];
    const acct = list.find(a => /^discount$/i.test(a.account_name.trim())) || list.find(a => /discount/i.test(a.account_name));
    if (!acct) throw new Error('No discount account found — create an account named "Discount" in Zoho Books (Chart of Accounts)');
    discountAcctCache[key] = acct.account_id;
  }
  return discountAcctCache[key];
};

// Discount is on the subtotal (before tax) but deducted from the total after tax:
// total = subtotal + tax − discount
export const createBill = async (org, b) => {
  const subtotal = b.lineItems.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 1), 0);
  const discount = Math.round((Number(b.discount_amount) > 0
    ? Number(b.discount_amount)
    : subtotal * (Number(b.discount_percent) || 0) / 100) * 100) / 100;
  // Zoho decides intra/inter-state from source (vendor GSTIN) vs destination (PM's property state)
  const destination = stateCode(b.source_of_supply);
  const source = gstinState(b.vendorGstin)?.code || destination;
  return (await z(org, 'post', '/bills', {
    data: {
      vendor_id: b.vendorId, bill_number: b.billNumber, date: b.date, due_date: b.dueDate,
      ...(source ? { source_of_supply: source } : {}),
      ...(destination ? { destination_of_supply: destination } : {}),
      ...(b.location_id ? { location_id: b.location_id } : {}),
      ...(discount > 0 ? {
        discount, is_discount_before_tax: false, discount_type: 'entity_level',
        discount_account_id: await discountAccount(org)
      } : {}),
      line_items: b.lineItems.map(l => ({
        account_id: l.account_id, name: l.name, description: l.description || '',
        rate: l.rate, quantity: l.quantity, ...(l.tax_id ? { tax_id: l.tax_id } : {})
      }))
    }
  })).bill.bill_id;
};

// `file` is a Buffer (from GridFS) or a local path
export const attach = async (org, billId, file, mimeType = 'application/pdf') => {
  const fd = new FormData();
  let ext = 'pdf';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = 'jpg';
  else if (mimeType?.includes('png')) ext = 'png';
  else if (mimeType?.includes('webp')) ext = 'webp';
  fd.append('attachment', Buffer.isBuffer(file) ? file : fs.createReadStream(file), `invoice.${ext}`);
  await z(org, 'post', `/bills/${billId}/attachment`, { data: fd, headers: fd.getHeaders() });
};
