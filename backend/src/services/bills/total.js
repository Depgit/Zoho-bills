// Bill total as shown in the form: subtotal + tax − discounts (discounts are taken after tax)
import { discountTotal } from './discounts.js';

const lineAmount = (l) => (Number(l.rate) || 0) * (Number(l.quantity) || 1);

export const billSubtotal = (b) => (b.lineItems || []).reduce((s, l) => s + lineAmount(l), 0);

export function billTotal(b) {
  const items = b.lineItems || [];
  const subtotal = billSubtotal(b);
  const tax = items.reduce((s, l) => s + (lineAmount(l) * (Number(l.tax_percentage) || 0)) / 100, 0);
  return Math.round((subtotal + tax - discountTotal(b, subtotal)) * 100) / 100;
}
