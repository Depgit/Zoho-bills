// Deductions printed in the totals block, under the Sub Total — e.g.
//     Amount Withheld
//                       (-) 7,602.00          → { description: 'Amount Withheld', amount: 7602 }
//     Less: Discount        1,000.00          → { description: 'Discount', amount: 1000 }
// They become the bill's discount rows (taken off after tax), so the form's total matches the bill.
const AMOUNT = /([\d,]+\.\d{1,2})/;
const MINUS = /\(\s*-\s*\)|(?:^|\s)-\s*(?=(?:rs\.?|₹)?\s*[\d,]+\.\d)|\bless\b\s*:?/i;
const LABELLED = /\b(discount|amount\s+withheld|withheld|tds|tcs\s+deduct|deduction|rebate|advance\s+paid|less)\b/i;
const START = /\b(sub\s*-?\s*total|taxable\s+(value|amount))\b/i;
const STOP = /\b(grand\s+total|balance\s+due|total\s+in\s+words|amount\s+in\s+words|amount\s+payable|^\s*total\b)/i;

const textOf = (line) =>
  line
    .replace(AMOUNT, '')
    .replace(MINUS, ' ')
    .replace(/\b(rs\.?|inr)\b|₹|:/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function parseDeductions(layoutText) {
  const lines = String(layoutText || '').replace(/\f/g, '\n').split('\n');
  const start = lines.findIndex((l) => START.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (STOP.test(line.trim())) break;
    const amount = line.match(AMOUNT)?.[1];
    if (!amount || !(MINUS.test(line) || LABELLED.test(line))) continue;
    if (/\b(igst|cgst|sgst|gst|cess)\b/i.test(line) && !MINUS.test(line)) continue; // a tax line, not a deduction
    // Label on the same line, else the nearest text line above
    let description = textOf(line);
    for (let j = i - 1; !description && j > start; j--) {
      const above = lines[j].trim();
      if (above && !AMOUNT.test(above)) description = textOf(above);
    }
    out.push({ description: description || 'Deduction', amount: Number(amount.replace(/,/g, '')) });
  }
  return out;
}
