// Bill discounts: a list of rows, each a flat ₹ amount or a % of the subtotal, all taken off
// AFTER tax (total = subtotal + tax − Σ discounts). Zoho gets their sum as one bill discount.
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Form rows → clean rows (empty / zero rows dropped)
export const cleanDiscounts = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((d) => ({
      description: String(d?.description || '').trim().slice(0, 200),
      type: d?.type === 'percent' ? 'percent' : 'amount',
      value: Math.max(0, num(d?.value)),
      account_id: String(d?.account_id || ''), // Zoho account the discount is booked to (e.g. Purchase Discount)
    }))
    .filter((d) => d.value > 0);

// A row's ₹ amount
export const discountAmount = (d, subtotal) => round2(d.type === 'percent' ? (subtotal * d.value) / 100 : d.value);

// The bill's discount rows — older bills only have discount_amount / discount_percent
export function discountRows(b) {
  if (Array.isArray(b.discounts) && b.discounts.length) return b.discounts;
  if (Number(b.discount_amount) > 0) return [{ description: 'Discount', type: 'amount', value: Number(b.discount_amount) }];
  if (Number(b.discount_percent) > 0) return [{ description: 'Discount', type: 'percent', value: Number(b.discount_percent) }];
  return [];
}

export const discountTotal = (b, subtotal) => round2(discountRows(b).reduce((s, d) => s + discountAmount(d, subtotal), 0));

// The Zoho account for the bill's discount: Zoho takes one per bill → the first row that has one
export const discountAccountOf = (b) => discountRows(b).find((d) => d.account_id)?.account_id || '';

// "Amount Withheld ₹7,602.00; Early payment 2% (₹500.00)" — for the Zoho bill's notes
export const discountNote = (b, subtotal) =>
  discountRows(b)
    .map((d) => `${d.description || 'Discount'} ${d.type === 'percent' ? `${d.value}% (₹${discountAmount(d, subtotal).toFixed(2)})` : `₹${d.value.toFixed(2)}`}`)
    .join('; ');
