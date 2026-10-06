// Apply the form to a bill and either keep it as a DRAFT or submit it into the chain.
// body.draft = true → save only (assigned PMs already see their amount, marked Draft)
import { checkSubmittable } from './validation.js';
import { resolveAllocations } from './allocations.js';
import { resolveBillLocation } from './location.js';
import { billSubtotal, billTotal } from './total.js';
import { cleanDiscounts, discountTotal } from './discounts.js';
import { startChain } from './workflow.js';

// Fields copied from the form as-is (location / allocations are resolved separately)
const FORM_FIELDS = [
  'vendorId',
  'vendorName',
  'billNumber',
  'date',
  'dueDate',
  'lineItems',
  'extracted',
  'fileType',
  'discount_amount',
  'discount_percent',
];
const pickFormFields = (body) => Object.fromEntries(FORM_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));

export async function saveBill(b, body, owner) {
  Object.assign(b, pickFormFields(body));
  // Discount rows; discount_amount keeps their ₹ total (what Zoho gets)
  if ('discounts' in body) {
    b.discounts = cleanDiscounts(body.discounts);
    b.discount_amount = discountTotal(b, billSubtotal(b));
    b.discount_percent = 0;
  }
  Object.assign(b, await resolveBillLocation(owner, body.location_id || b.location_id));
  const submitting = !body.draft;
  b.total = billTotal(b);
  b.allocations = await resolveAllocations(owner, body.allocations, b.total, submitting);
  b.zohoError = null;

  if (!submitting) {
    Object.assign(b, { status: 'DRAFT', stage: '', approverId: null });
    return;
  }
  await checkSubmittable(b);
  await startChain(b, owner, body.lineItems);
}
