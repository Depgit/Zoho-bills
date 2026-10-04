// Bill total as shown in the form: subtotal + tax − discount (discount is taken after tax)
export function billTotal(b) {
  const items = b.lineItems || [];
  const lineAmount = (l) => (Number(l.rate) || 0) * (Number(l.quantity) || 1);
  const subtotal = items.reduce((s, l) => s + lineAmount(l), 0);
  const tax = items.reduce((s, l) => s + (lineAmount(l) * (Number(l.tax_percentage) || 0)) / 100, 0);
  const discount =
    Number(b.discount_amount) > 0 ? Number(b.discount_amount) : (subtotal * (Number(b.discount_percent) || 0)) / 100;
  return Math.round((subtotal + tax - discount) * 100) / 100;
}
