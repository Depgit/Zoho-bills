import { idOf } from './ids.js';

export const lineAmount = (l) => (Number(l.rate) || 0) * (Number(l.quantity) || 1);

// A line's tax and its total including tax
export const lineTax = (l) => (lineAmount(l) * (Number(l.tax_percentage) || 0)) / 100;
export const lineTotal = (l) => lineAmount(l) + lineTax(l);

// Discount rows [{ description, type: 'amount' | 'percent', value }] — older bills: their single discount
export function discountRows(b) {
  if (Array.isArray(b?.discounts)) return b.discounts;
  if (Number(b?.discount_amount) > 0) return [{ description: 'Discount', type: 'amount', value: Number(b.discount_amount) }];
  if (Number(b?.discount_percent) > 0) return [{ description: 'Discount', type: 'percent', value: Number(b.discount_percent) }];
  return [];
}

// A discount row's ₹ amount (a % is of the subtotal)
export const discountAmount = (d, subtotal) => (d.type === 'percent' ? (subtotal * (Number(d.value) || 0)) / 100 : Number(d.value) || 0);

// Subtotal, discounts and total = subtotal + tax − Σ discounts (discounts are taken after tax)
export function billTotals(b) {
  const items = b?.lineItems || [];
  const subtotal = items.reduce((s, l) => s + lineAmount(l), 0);
  const discount = discountRows(b).reduce((s, d) => s + discountAmount(d, subtotal), 0);
  const withTax = items.reduce((s, l) => s + lineAmount(l) * (1 + (Number(l.tax_percentage) || 0) / 100), 0);
  return { subtotal, discount, total: withTax - discount };
}

// Bill total, falling back to the OCR total when there are no usable lines
export function getBillTotal(b) {
  if (!b) return 0;
  if (b.lineItems?.length) {
    const { total } = billTotals(b);
    if (total > 0) return total;
  }
  const parsed = parseFloat(String(b.extracted?.total || '').replace(/[^0-9.]/g, ''));
  return !isNaN(parsed) && parsed > 0 ? parsed : 0;
}

// A PM's share of a bill (their allocation), or 0
export const shareOf = (b, pmId) => Number(b?.allocations?.find((a) => idOf(a.pmId) === String(pmId))?.amount) || 0;

// `total` split equally over `n` people, in paise; the last share takes the rounding remainder
export function splitEqually(total, n) {
  if (!n) return [];
  const paise = Math.round((Number(total) || 0) * 100);
  const share = Math.floor(paise / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? paise - share * (n - 1) : share) / 100);
}

// Are these amounts what an equal split of `total` would give?
export const isEqualSplit = (amounts, total) => {
  const equal = splitEqually(total, amounts.length);
  return amounts.every((a, i) => Math.abs((Number(a) || 0) - equal[i]) < 0.01);
};

// The expense account discounts are booked to by default: "Purchase Discount" (else any "Discount" account)
export function defaultDiscountAccount(accounts = []) {
  const named = (re) => accounts.find((a) => re.test(String(a.account_name || '').trim()));
  return (named(/^purchase\s*discounts?$/i) || named(/purchase\s*discount/i) || named(/^discounts?$/i) || named(/discount/i))?.account_id || '';
}
