// Regex parse of OCR text: GSTIN(s), invoice no, date, tax %, total.
// Used as a hint for the AI, to fill fields the AI left empty, and as the last-resort result.
import { VALID_GSTIN } from './config.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const SLABS = [0, 0.25, 3, 5, 12, 18, 28];
const snapSlab = (p) => SLABS.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));

// GSTIN layout: d d L L L L L d d d d L a Z a — fix common OCR digit/letter swaps
const GSTIN_LAYOUT = 'ddLLLLLddddLaZa';
const OCR_TO_DIGIT = { O: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6', D: '0', Q: '0', T: '7' };
const OCR_TO_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z', 6: 'G' };

function repairGstin(token) {
  if (token?.length !== 15) return '';
  let out = '';
  for (let i = 0; i < 15; i++) {
    const ch = token[i].toUpperCase();
    const kind = GSTIN_LAYOUT[i];
    if (kind === 'd') out += OCR_TO_DIGIT[ch] || ch;
    else if (kind === 'L') out += OCR_TO_LETTER[ch] || ch;
    else if (kind === 'Z') out += 'Z';
    else out += ch;
  }
  return VALID_GSTIN.test(out) ? out : '';
}

function findDate(text) {
  const re = /(\d{1,2})[\s\-/.]([A-Za-z]{3}|\d{1,2})[a-z]*[\s\-/.](\d{4}|\d{2})\b/g;
  for (const m of String(text || '').matchAll(re)) {
    const d = +m[1];
    const mo = isNaN(m[2]) ? MONTHS[m[2].toLowerCase()] : +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return '';
}

// Bill / invoice number: "Invoice No", "Bill No", "Inv. No.", "Invoice #", "Bill Number", "Receipt No",
// "Voucher No", "Document No", "Ref No"…, value on the same line or the next one.
// The value must contain a digit and not be a date or a GSTIN.
const INVOICE_LABEL = String.raw`(?:Tax\s*)?(?:Invoice|Inv|Bill|Receipt|Voucher|Document|Doc|Ref(?:erence)?)\.?\s*(?:No\.?|Num(?:ber)?\.?|#|Id)`;
const INVOICE_VALUE = String.raw`([A-Z0-9][A-Z0-9\/\-_.]{0,29})`;
const INVOICE_PATTERNS = [
  new RegExp(`\\b${INVOICE_LABEL}\\s*[:#.\\-]?[ \\t]*${INVOICE_VALUE}`, 'gi'), // same line
  new RegExp(`\\b${INVOICE_LABEL}\\s*[:#.\\-]?[ \\t]*\\n[ \\t]*${INVOICE_VALUE}`, 'gi'), // next line
  /\b([A-Z]{2,6}\/\d{2}-\d{2}\/\d{3,})\b/g, // YCS/26-27/028915
  /\b([A-Z]{2,5}-?\d{2,4}[/-]\d{3,})\b/g, // INV-2024/0012
];

function pickInvoiceNo(text) {
  if (!text) return '';
  for (const re of INVOICE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const v = m[1].replace(/[.\-/]+$/, '').toUpperCase();
      if (/\d/.test(v) && !findDate(v) && !VALID_GSTIN.test(v)) return v;
    }
  }
  return '';
}

export function parseOcr(text) {
  if (!text) return null;
  const money = (s) => Number(String(s).replace(/,/g, '')) || 0;

  const gstins = [...new Set((text.match(/\b[0-9A-Za-z]{15}\b/g) || []).map(repairGstin).filter(Boolean))];
  // Seller = GSTIN next to a plain "GSTIN" label (not "GSTIN Cust"), else the first one
  const sellerToken = /\bGSTIN\b(?!\s*:?\s*Cust)[\s:-]*([0-9A-Za-z]{15})/i.exec(text)?.[1];
  const gstin = repairGstin(sellerToken) || gstins[0] || '';

  const invoice_no = pickInvoiceNo(text);

  const dateLine = /(?:Invoice\s*Date|Date)\s*[:-]?\s*([^\n]{0,30})/i.exec(text)?.[1];
  const date = findDate(dateLine) || findDate(text);

  const rate = (re) => +(re.exec(text)?.[1] || 0);
  const igst = rate(/IGST\s*@?\s*\(?(\d+(?:\.\d+)?)/i);
  const cgst = rate(/CGST\s*@?\s*\(?(\d+(?:\.\d+)?)/i);
  const sgst = rate(/SGST\s*@?\s*\(?(\d+(?:\.\d+)?)/i);
  let tax_percent = 0;
  let tax_name = '';
  if (igst) {
    tax_percent = snapSlab(igst);
    tax_name = `IGST${tax_percent}`;
  } else if (cgst && sgst) {
    tax_percent = snapSlab(cgst + sgst);
    tax_name = `CGST${tax_percent / 2}+SGST${tax_percent / 2}`;
  }

  const totalMatch = /(?:Grand\s*Total|Net\s*Payable|Balance\s*Due|Total\s*Amount|^\s*Total)\b[^\d\n]*([\d,]+\.\d{2})/im.exec(text);
  const amounts = (text.match(/\d[\d,]*\.\d{2}/g) || []).map(money);
  const total = totalMatch ? money(totalMatch[1]) : amounts.length ? Math.max(...amounts) : 0;

  return { gstin, gstins, invoice_no, date, tax_percent, tax_name, total };
}
