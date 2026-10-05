// Create a bill in Zoho Books and attach its file
import fs from 'fs';
import FormData from 'form-data';
import { gstinState, stateCode } from '../../services/gst.service.js';
import { zohoRequest } from './request.js';

// Zoho books a bill-level discount into an account — use the org's account named "Discount"
const discountAccountCache = {};
async function discountAccount(org) {
  const key = String(org.id);
  if (!discountAccountCache[key]) {
    const res = await zohoRequest(org, 'get', '/chartofaccounts', { params: { per_page: 200 } });
    const list = res.chartofaccounts || [];
    const account =
      list.find((a) => /^discount$/i.test(a.account_name.trim())) || list.find((a) => /discount/i.test(a.account_name));
    if (!account) {
      throw new Error('No discount account found — create an account named "Discount" in Zoho Books (Chart of Accounts)');
    }
    discountAccountCache[key] = account.account_id;
  }
  return discountAccountCache[key];
}

// Discount is on the subtotal (before tax) but deducted from the total after tax:
// total = subtotal + tax − discount
export async function createBill(org, b) {
  const subtotal = b.lineItems.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 1), 0);
  const rawDiscount =
    Number(b.discount_amount) > 0 ? Number(b.discount_amount) : (subtotal * (Number(b.discount_percent) || 0)) / 100;
  const discount = Math.round(rawDiscount * 100) / 100;
  // Zoho decides intra/inter-state from source (vendor GSTIN) vs destination (bill location state)
  const destination = stateCode(b.source_of_supply);
  const source = gstinState(b.vendorGstin)?.code || destination;

  const res = await zohoRequest(org, 'post', '/bills', {
    data: {
      vendor_id: b.vendorId,
      bill_number: b.billNumber,
      date: b.date,
      due_date: b.dueDate,
      ...(source ? { source_of_supply: source } : {}),
      ...(destination ? { destination_of_supply: destination } : {}),
      ...(b.location_id ? { location_id: b.location_id } : {}),
      ...(discount > 0
        ? {
            discount,
            is_discount_before_tax: false,
            discount_type: 'entity_level',
            discount_account_id: await discountAccount(org),
          }
        : {}),
      line_items: b.lineItems.map((l) => ({
        account_id: l.account_id,
        name: l.name,
        description: l.description || '',
        rate: l.rate,
        quantity: l.quantity,
        ...(l.tax_id ? { tax_id: l.tax_id } : {}),
      })),
    },
  });
  return res.bill.bill_id;
}

// `file` is a Buffer (from file storage) or a local path
export async function attach(org, billId, file, mimeType = 'application/pdf') {
  let ext = 'pdf';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = 'jpg';
  else if (mimeType?.includes('png')) ext = 'png';
  else if (mimeType?.includes('webp')) ext = 'webp';
  const fd = new FormData();
  fd.append('attachment', Buffer.isBuffer(file) ? file : fs.createReadStream(file), `invoice.${ext}`);
  await zohoRequest(org, 'post', `/bills/${billId}/attachment`, { data: fd, headers: fd.getHeaders() });
}
