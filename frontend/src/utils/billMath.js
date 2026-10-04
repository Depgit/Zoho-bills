import { idOf } from './ids.js';

export const lineAmount = (l) => (Number(l.rate) || 0) * (Number(l.quantity) || 1);

// Subtotal, discount (flat amount, else % of subtotal) and total = subtotal + tax − discount
export function billTotals(b) {
  const items = b?.lineItems || [];
  const subtotal = items.reduce((s, l) => s + lineAmount(l), 0);
  const discount =
    Number(b?.discount_amount) > 0
      ? Number(b.discount_amount)
      : Number(b?.discount_percent) > 0
        ? (subtotal * Number(b.discount_percent)) / 100
        : 0;
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
