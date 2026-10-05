// The prompt every AI provider gets (OCR text in, JSON out) and the JSON reader
const INSTRUCTIONS = `Extract this Indian GST tax invoice summary.
Look at the first pages for header/vendor details and the last page for totals and tax rates.

Instructions:
1. tax_percent: Find tax lines like "IGST18 (18%)", "CGST (9%) + SGST (9%)", "GST@18%" etc.
   - If IGST only → tax_percent = that rate (e.g. 18).
   - If CGST + SGST → tax_percent = combined (e.g. 9+9=18).
2. tax_name: The exact label as it appears, e.g. "IGST18", "CGST9+SGST9", "GST18".
3. line_items: Extract EVERY row of the invoice table, on every page — do not merge, skip or summarise rows.
   For each line item:
   - name: item description / product name (as printed)
   - hsn: HSN / SAC code of the row if shown (else "")
   - quantity: numeric quantity
   - rate: unit price / rate per unit BEFORE tax (NOT the line total). Look for columns labelled Price, Rate, Unit Price, MRP, Sub Total per unit.
     If the table has a per-row Discount column, give the rate AFTER that discount: rate = row Amount ÷ quantity
     (e.g. Qty 1, Rate 18,000.00, Discount 65.00%, Amount 6,300.00 → rate 6300).
     Numbers can wrap onto the next line in the text ("18,000." then "00" below) — join them.
   - tax_percent: the GST rate of THIS row (IGST %, or CGST % + SGST %). Use the row's own tax column, or the
     HSN-wise tax summary; rows can differ (e.g. one item 18%, another 0%). If the invoice shows only one rate, use it.
   Do not include tax lines, discount lines, round-off or totals as items.
4. discount_amount: flat discount in ₹ if mentioned (else 0).
5. discount_percent: discount as % if mentioned (else 0).
6. gstin: The SELLER'S GSTIN (the vendor, usually in the letterhead at the top).
7. gstins: An array of ALL GSTINs visible on the invoice — seller AND buyer.
   - The seller's GSTIN is next to a plain "GSTIN :" label.
   - The buyer's GSTIN is next to labels like "GSTIN Cust", "Customer GSTIN",
     "Buyer GSTIN", or under Bill-To / Ship-To blocks.
   - Return every distinct 15-character GSTIN you can read.
8. date: convert to YYYY-MM-DD. Indian invoices write dates day-first (DD/MM/YYYY).
9. All amounts as plain numbers, no ₹ symbol or commas.

Reply with ONLY valid JSON:
{
  "vendor_name": "seller name",
  "gstin": "seller GSTIN",
  "gstins": ["seller GSTIN", "buyer GSTIN"],
  "invoice_no": "",
  "date": "YYYY-MM-DD",
  "tax_percent": 0,
  "tax_name": "",
  "tax_amount": 0,
  "discount_amount": 0,
  "discount_percent": 0,
  "total": 0,
  "line_items": [
    { "name": "item description", "hsn": "", "quantity": 1, "rate": 0.00, "tax_percent": 18 }
  ]
}`;

const TEXT_INTRO = `You are given the text of an invoice (not the image) — read from the PDF itself, or by OCR. OCR may mis-read
characters (O↔0, I↔1, S↔5, B↔8) and break table rows across lines — use context to correct them.
If a field is genuinely not in the text, leave it empty / 0.\n\n`;

export const SYSTEM_PROMPT = 'You extract structured data from Indian GST tax invoices. Reply with ONLY valid JSON.';

// `examples`: few-shot block of earlier approved invoices (services/learning), or ''
export function textPrompt(ocrText, regexFields, examples = '') {
  return (
    TEXT_INTRO +
    INSTRUCTIONS +
    (examples ? `\n\n${examples}` : '') +
    `\n\nFields pre-extracted by regex (may be wrong or incomplete — verify against the text):\n${JSON.stringify(regexFields ?? {}, null, 2)}` +
    `\n\nDocument text (columns are kept apart by spaces):\n-----\n${ocrText.slice(0, 60000)}\n-----`
  );
}

export function extractJson(raw) {
  const cleaned = String(raw || '')
    .replace(/```json|```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object found in response: ${cleaned.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
