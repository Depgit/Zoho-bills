// extract.js
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import pdf from 'pdf-parse';
import { pdf as pdfToImg } from 'pdf-to-img';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

// ─────────────────────────── constants ───────────────────────────
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONEY = /\d[\d,]*\.\d{2}/g;
const DATE_RE = /(\d{1,2})[\s\-\/.]([A-Za-z]{3}|\d{1,2})[\s\-\/.](\d{4}|\d{2})/g;
const SLABS = [0, 0.25, 3, 5, 12, 18, 28];
const GSTIN_RE_STR = '\\d{2}[A-Z]{5}\\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]';
const VALID_GSTIN = new RegExp(`^${GSTIN_RE_STR}$`, 'i');

// Legal-suffix patterns used to spot a proper company name.
const COMPANY_SUFFIX = /^(.+?(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|LLP|Limited|Inc\.?|Corporation|Corp\.?|Technologies|Solutions|Systems|Services|Enterprises|Traders|Industries|Agencies|Distributors|Suppliers|Trading))\b/im;

// Lines that should never be mistaken for the vendor name.
const VENDOR_BAD = /(:|GSTIN|Tax\s*Invoice|Invoice\s*#|Order|Cons\s*No|Booking|Name\s*:|Address\s*:|Landmark|Category|Equipment|Price|CGST|SGST|IGST|Net\s*Payable|Paid|Total|Sub\s*Total|Date|Amount|Rate|Qty|HSN|SAC|Refill|WhatsApp|Missed|Emergency|Working|Customer|LPG|Indian\s*Oil|Balance\s*Due|Due\s*Date|Invoice\s*Date|Place\s*of\s*Supply|Bill\s*To|Ship\s*To|Billed\s*To|Consignee|Buyer)/i;

// Where the buyer block begins. Everything from here on is not the seller.
const BUYER_MARKERS = /\b(Bill\s*To|Billed\s*To|Ship\s*To|Consignee|Buyer|Customer|Name\s*:)/i;

// Invoice-number patterns, tried in order. Leading digits allowed.
const INVOICE_PATTERNS = [
  /Tax\s+Invoice\s*(?:No\.?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-]{4,})/i,
  /Invoice\s*#?\s*(?:No\.?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-]{4,})/i,
  /\b([A-Z]{2,6}\/\d{2}-\d{2}\/\d{4,})\b/,   // YCS/26-27/028915
  /\b(\d{1,4}-\d{8,})\b/,                     // 5-106639814873 (IndianOil LPG)
];

// ─────────────────── GSTIN fuzzy-repair tables ───────────────────
// Layout of a valid GSTIN:  d d L L L L L d d d d L a Z a
// (d = digit, L = letter, a = alphanumeric, Z = literal 'Z')
const GSTIN_LAYOUT = 'ddLLLLLddddLaZa'.split('');

// Common OCR confusions when a digit was mis-read as a letter, and vice-versa.
const OCR_TO_DIGIT = { O: '0', o: '0', I: '1', l: '1', L: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', D: '0', Q: '0', T: '7' };
const OCR_TO_LETTER = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };

// Try to turn a 15-char OCR token into a valid GSTIN using the layout.
function repairGstinCandidate(s) {
  if (!s || s.length !== 15) return '';
  let out = '';
  for (let i = 0; i < 15; i++) {
    const ch = s[i].toUpperCase();
    const kind = GSTIN_LAYOUT[i];
    if (kind === 'd') out += OCR_TO_DIGIT[ch] || ch;
    else if (kind === 'L') out += OCR_TO_LETTER[ch] || ch;
    else if (kind === 'Z') out += 'Z';
    else out += ch;
  }
  return VALID_GSTIN.test(out) ? out : '';
}

// ─────────────────────────── generic helpers ───────────────────────────
const iso = (s) => {
  const m = /(\d{1,2})[-\/ ]([a-z]{3})[a-z]*[-\/ ](\d{4})/i.exec(s || '');
  return m ? `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const num = (s) => parseFloat(String(s ?? '').replace(/[₹,\s]/g, '')) || 0;

function findDate(str) {
  if (!str) return '';
  for (const m of String(str).matchAll(DATE_RE)) {
    const d = +m[1];
    const mo = isNaN(m[2]) ? MON[m[2].toLowerCase()] : +m[2];
    let y = +m[3]; if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}
const snapSlab = (p) => SLABS.reduce((a, b) => Math.abs(b - p) < Math.abs(a - p) ? b : a);

// Strip barcode/pattern garbage and flag pages that are mostly noise.
function cleanExtractedText(raw) {
  if (!raw) return null;
  const tokens = String(raw).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  const singleCharRatio = tokens.filter((t) => t.length === 1).length / tokens.length;
  const isGarbage = singleCharRatio > 0.4;

  const cleaned = String(raw)
    .replace(/[|]/g, ' ')
    .replace(/(?:\b1\b\s+){4,}/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n');

  return { cleaned, isGarbage };
}

// Retry wrapper for transient upstream errors (Gemini 503/429).
async function withRetry(fn, tries = 4, baseMs = 800) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const code = e?.error?.code || e?.status || e?.code;
      if (code !== 503 && code !== 'UNAVAILABLE' && code !== 429) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

// ─────────────────── field extractors (shared by Tesseract & Regex) ───────────────────

// Vendor name: prefer a proper company name (title-case + legal suffix) inside the
// header region; fall back to an ALL-CAPS banner; never cross into the buyer block.
function guessVendorFromText(text) {
  if (!text) return '';
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Cut off at the first buyer-section marker so we never pick the buyer's name.
  let cutoff = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (BUYER_MARKERS.test(lines[i])) { cutoff = i; break; }
  }
  const head = lines.slice(0, cutoff);

  // 1) Proper company name (title case + legal suffix) in the header region.
  //    Wins over ALL-CAPS banners like "TAX INVOICE".
  //    IMPORTANT: test the *matched name* (m[1]), not the entire line, because
  //    OCR often merges "MARS ENTERPRISES GSTIN: ..." onto one line.
  for (const line of head) {
    const m = COMPANY_SUFFIX.exec(line);
    if (m && !VENDOR_BAD.test(m[1])) return m[1].trim();
  }

  // 2) ALL-CAPS banner in the header region (e.g. "MARS ENTERPRISES" on LPG receipt).
  const caps = head.slice(0, 20).find((l) => {
    const letters = l.replace(/[^A-Za-z]/g, '');
    if (letters.length < 6 || l.length > 60) return false;
    const upperRatio = (l.match(/[A-Z]/g) || []).length / letters.length;
    if (!(upperRatio > 0.7 && /^[A-Z][A-Z0-9 .&'\-]+$/.test(l))) return false;
    // Reject only if the candidate itself contains a hard bad word.
    return !/\b(GSTIN|Tax\s*Invoice|Net\s*Payable|Balance\s*Due|Invoice\s*#?)\b/i.test(l);
  });
  if (caps) return caps;

  // 3) Company-suffix anywhere (no buyer markers were seen — trust the first match).
  const anySuffix = COMPANY_SUFFIX.exec(text);
  return anySuffix?.[1]?.trim() || '';
}

// Find every GSTIN-like token in text, repairing OCR errors.
function extractGstins(text) {
  if (!text) return [];
  const out = new Set();

  // (1) strict, well-formed GSTINs
  for (const m of text.matchAll(new RegExp(`\\b${GSTIN_RE_STR}\\b`, 'gi'))) {
    out.add(m[0].toUpperCase());
  }

  // (2) fuzzy: 15-char alphanumeric tokens that become valid after repair
  for (const m of text.matchAll(/\b([0-9A-Za-z]{15})\b/g)) {
    const fixed = repairGstinCandidate(m[1]);
    if (fixed) out.add(fixed);
  }

  return [...out];
}



function pickSellerGstin(text, gstins = []) {
  if (!text) return gstins[0] || '';

  // 1) Any "GSTIN" label that is NOT "GSTIN Cust" (i.e. seller side),
  //    scan the next ~40 chars for a 14–16 char alphanumeric token.
  const labelRe = /\bGSTIN\b(?!\s*:?\s*Cust)[\s:\-]*([^\n]{0,40})/gi;
  for (const m of text.matchAll(labelRe)) {
    const toks = (m[1].match(/[0-9A-Za-z]+/g) || []);
    for (const tok of toks) {
      if (tok.length === 15 && VALID_GSTIN.test(tok)) return tok.toUpperCase();
      if (tok.length === 15) {
        const fixed = repairGstinCandidate(tok);
        if (fixed) return fixed;
      }
      if (tok.length === 14 || tok.length === 16) {
        for (let i = 0; i + 15 <= tok.length; i++) {
          const fixed = repairGstinCandidate(tok.slice(i, i + 15));
          if (fixed) return fixed;
        }
      }
    }
  }

  // 2) Header region (first 800 chars) — any 15-char token that repairs to a valid GSTIN.
  const head = text.slice(0, 800);
  for (const m of head.matchAll(/\b([0-9A-Za-z]{15})\b/g)) {
    const fixed = repairGstinCandidate(m[1]);
    if (fixed) return fixed;
  }

  // 3) Strict regex anywhere.
  const m2 = new RegExp(`\\b${GSTIN_RE_STR}\\b`).exec(text);
  if (m2) return m2[0].toUpperCase();

  return gstins[0] || '';
}

// Invoice number: try each pattern, skip anything that parses as a date.
function pickInvoiceNo(text) {
  if (!text) return '';
  for (const p of INVOICE_PATTERNS) {
    const m = p.exec(text);
    if (m && !findDate(m[1])) return m[1];
  }
  return '';
}

// Tax %: works even if OCR dropped the '%' char (@9 instead of @9%).
// Returns { tax_percent: number, tax_name: string }
function guessTaxInfo(text) {
  if (!text) return { tax_percent: 0, tax_name: '' };
  const grab = (re) => +(re.exec(text)?.[1] || 0);

  const igst = grab(/IGST\s*[@]?\s*(\d+(?:\.\d+)?)/i);
  const cgst = grab(/CGST\s*[@]?\s*(\d+(?:\.\d+)?)/i);
  const sgst = grab(/SGST\s*[@]?\s*(\d+(?:\.\d+)?)/i);
  const gst = grab(/\bGST\s*[@]?\s*(\d+(?:\.\d+)?)/i);

  if (igst) {
    return { tax_percent: snapSlab(igst), tax_name: `IGST${snapSlab(igst)}` };
  }
  if (cgst || sgst) {
    const combined = snapSlab(cgst + sgst);
    const name = cgst && sgst ? `CGST${snapSlab(cgst)}+SGST${snapSlab(sgst)}` : `CGST${snapSlab(cgst || sgst)}`;
    return { tax_percent: combined, tax_name: name };
  }
  if (gst) {
    return { tax_percent: snapSlab(gst), tax_name: `GST${snapSlab(gst)}` };
  }

  const pcts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
    .map((m) => +m[1]).filter((p) => p > 0 && p <= 28);
  if (pcts.length >= 2) {
    const combined = snapSlab(pcts[0] + pcts[1]);
    return { tax_percent: combined, tax_name: `GST${combined}` };
  }
  if (pcts.length === 1) {
    const p = snapSlab(pcts[0]);
    return { tax_percent: p, tax_name: `GST${p}` };
  }
  return { tax_percent: 0, tax_name: '' };
}
// Backward-compat shim used by older call sites.
const guessTaxPercent = (text) => guessTaxInfo(text).tax_percent;

// Total: Net Payable → Balance Due → Total (not Sub Total) → max(MONEY).
function pickTotal(text, lines) {
  if (!text) return 0;

  const np = /Net\s*Payable\s*(?:\(Rs\.?\))?\s*[: ]\s*([\d,]+\.\d{2})/i.exec(text);
  if (np) return num(np[1]);

  const bd = /Balance\s+Due\s*(?:Rs\.?\s*)?([\d,]+\.\d{2})/i.exec(text);
  if (bd) return num(bd[1]);

  const scanLines = lines || text.split('\n');
  for (const line of scanLines) {
    if (/^\s*Total\b/i.test(line) && !/Sub\s*Total/i.test(line)) {
      const m = /([\d,]+\.\d{2})/.exec(line);
      if (m) return num(m[1]);
    }
  }
  const amounts = (text.match(MONEY) || []).map(num);
  return amounts.length ? Math.max(...amounts) : 0;
}

// ─────────────────── trim PDF once, reuse everywhere ───────────────────
async function trimPdf(filePath, firstN = 2, lastN = 2) {
  const raw = fs.readFileSync(filePath);
  try {
    const doc = await PDFDocument.load(raw);
    const total = doc.getPageCount();

    if (total <= firstN + lastN) {
      return { bytes: raw, base64: raw.toString('base64') };
    }

    const idx = [
      ...Array.from({ length: firstN }, (_, i) => i),
      ...Array.from({ length: lastN }, (_, i) => total - lastN + i),
    ];
    const unique = [...new Set(idx)];

    const out = await PDFDocument.create();
    const copied = await out.copyPages(doc, unique);
    copied.forEach((p) => out.addPage(p));

    const bytes = Buffer.from(await out.save());
    return { bytes, base64: bytes.toString('base64') };
  } catch (e) {
    console.warn('trimPdf failed, using raw PDF:', e.message);
    return { bytes: raw, base64: raw.toString('base64') };
  }
}

// ──────────────────────────── PROMPT ────────────────────────────
const PROMPT = `Extract this Indian GST tax invoice summary.
Look at the first pages for header/vendor details and the last page for totals and tax rates.

Instructions:
1. tax_percent: Find tax lines like "IGST18 (18%)", "CGST (9%) + SGST (9%)", "GST@18%" etc.
   - If IGST only → tax_percent = that rate (e.g. 18).
   - If CGST + SGST → tax_percent = combined (e.g. 9+9=18).
2. tax_name: The exact label as it appears, e.g. "IGST18", "CGST9+SGST9", "GST18".
3. line_items: Extract every row from the invoice table. For each line item:
   - name: item description / product name
   - quantity: numeric quantity
   - rate: unit price / rate per unit (NOT the line total). Look for columns labelled Price, Rate, Unit Price, MRP, Sub Total per unit.
4. discount_amount: flat discount in ₹ if mentioned (else 0).
5. discount_percent: discount as % if mentioned (else 0).
6. gstin: The SELLER'S GSTIN (the vendor, usually in the letterhead at the top).
7. gstins: An array of ALL GSTINs visible on the invoice — seller AND buyer.
   - The seller's GSTIN is next to a plain "GSTIN :" label.
   - The buyer's GSTIN is next to labels like "GSTIN Cust", "Customer GSTIN",
     "Buyer GSTIN", or under Bill-To / Ship-To blocks.
   - Return every distinct 15-character GSTIN you can read.

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
    { "name": "item description", "quantity": 1, "rate": 0.00 }
  ]
}`;

async function viaGemini(file, mimeType = 'application/pdf', trimmed = null) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const isPdf = !mimeType?.startsWith('image/');
  const base64Data = isPdf && trimmed ? trimmed.base64 : fs.readFileSync(file).toString('base64');

  const res = await withRetry(() => ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: PROMPT },
      ],
    }],
    config: { maxOutputTokens: 1000, responseMimeType: 'application/json' },
  }));

  return JSON.parse(res.text.trim());
}

// ──────────────────────────── CLAUDE (optional) ────────────────────────────
async function viaClaude(file, mimeType = 'application/pdf') {
  const isImage = mimeType?.startsWith('image/');
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  const contentBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: normalizedMime, data: fs.readFileSync(file).toString('base64') } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(file).toString('base64') } };

  const m = await new Anthropic().messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [contentBlock, { type: 'text', text: PROMPT }],
    }],
  });
  return JSON.parse(m.content.map((x) => x.text || '').join('').replace(/```json|```/g, '').trim());
}

// ──────────────────────────── TESSERACT ────────────────────────────
let workerPromise;
const getWorker = () => (workerPromise ??= (async () => {
  const w = await Tesseract.createWorker('eng');
  await w.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  });
  return w;
})());

// Default preprocessing: grayscale, upscaled, contrast-normalised.
async function preprocess(fileOrBuffer) {
  return sharp(fileOrBuffer)
    .rotate()
    .grayscale()
    .resize({ width: 2400 })
    .normalise()
    .sharpen()
    .png()
    .toBuffer();
}

// Red-channel variant: makes red-on-white ink (IndianOil / LPG receipts) near-black.
async function preprocessRed(fileOrBuffer) {
  return sharp(fileOrBuffer)
    .rotate()
    .extractChannel('green')
    .resize({ width: 2400 })
    .normalise()
    .sharpen()
    .png()
    .toBuffer();
}

// Render trimmed PDF pages to images and OCR them.
async function ocrPdfPages(pdfBytes) {
  const doc = await pdfToImg(pdfBytes, { scale: 2 });
  const worker = await getWorker();
  let out = '';
  for await (const pageBuf of doc) {
    const pre = await preprocess(pageBuf);
    out += (await worker.recognize(pre)).data.text + '\n';
  }
  return out;
}

async function viaTesseract(file, mimeType = 'application/pdf', trimmed = null) {
  const normalized = mimeType === 'image/jpg' ? 'image/jpeg' : (mimeType || 'application/pdf');
  const isPdf = normalized === 'application/pdf';

  let raw;
  if (isPdf && trimmed) {
    raw = (await pdf(trimmed.bytes)).text;
    const probe = cleanExtractedText(raw);
    // If the PDF's text layer is garbage (image-only / broken CMap), render + OCR.
    if (!probe || probe.isGarbage || probe.cleaned.length < 200) {
      try {
        raw = await ocrPdfPages(trimmed.bytes);
      } catch (e) {
        console.warn('pdf-to-img OCR fallback failed:', e.message);
      }
    }
  } else if (isPdf) {
    raw = (await pdf(fs.readFileSync(file))).text;
  } else {
    const worker = await getWorker();
    const [grayText, redText, headerText] = await Promise.all([
      preprocess(file).then((buf) => worker.recognize(buf)).then((r) => r.data.text),
      preprocessRed(file).then((buf) => worker.recognize(buf)).then((r) => r.data.text).catch(() => ''),
      ocrHeaderRegion(file).catch((e) => { console.warn('header OCR failed:', e.message); return ''; }),
    ]);
    if (process.env.DEBUG_OCR) console.log('=== HEADER OCR ===\n' + headerText);
    raw = headerText + '\n' + grayText + '\n' + redText;
  }

  const parsed = cleanExtractedText(raw);
  if (!parsed) return null;
  const { cleaned: text, isGarbage } = parsed;
  if (process.env.DEBUG_OCR) console.log(text);

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // ── vendor_name ──
  let vendor_name = guessVendorFromText(text);
  if (!vendor_name) {
    const ci = lines.findIndex((l) => /^Consignee/i.test(l));
    if (ci > 0) vendor_name = lines[ci - 1];
    if (!vendor_name)
      vendor_name = (text.match(/A\/c Holder'?s Name\s*:\s*(.+)/i) || text.match(/^for\s+(.+)$/im) || [])[1] || '';
  }
  vendor_name = vendor_name.split(/\s{2,}/)[0].replace(/\s*Invoice\s*#?.*$/i, '').trim();

  // ── gstin(s) ──
  const gstins = extractGstins(text);
  const gstin = pickSellerGstin(text, gstins);

  // ── invoice_no ──
  const invoice_no = pickInvoiceNo(text);

  // ── date ──
  const dated = (text.match(/(?:Dated|Date|Invoice\s*Date)[\s\S]{0,80}/i) || [''])[0];
  const date = findDate(dated) || findDate(text);

  // ── line_items ──
  // Try Tally/HSN pattern: S.No  Name  HSN-code  Qty  UOM  ...amounts
  const line_items = [];
  for (const line of lines) {
    // Classic Tally: 1  Item Name  12345678  10  NOS  100.00  1000.00
    const m = line.match(/^(\d{1,2})\s+(.+?)\s+(\d{4,8})\s+([\d,.]+)\s*([A-Za-z]{2,5})\b(.*)$/);
    if (m) {
      const quantity = num(m[4]);
      const nums = (m[6].match(MONEY) || []).map(num);
      if (quantity && nums.length) {
        const amount = nums[nums.length - 1];
        let rate = nums.length >= 2 ? nums[nums.length - 2] : 0;
        if (!rate || Math.abs(rate * quantity - amount) > 1) rate = +(amount / quantity).toFixed(2);
        line_items.push({ name: m[2].trim(), quantity, rate });
        continue;
      }
    }
    // Generic: look for lines that contain a Price/Rate/Sub-Total amount pattern
    // e.g. "  1   LPG Cylinder    1   800.00"
    const mg = line.match(/^(\d{1,3})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})$/);
    if (mg) {
      const quantity = num(mg[3]);
      const amount = num(mg[4]);
      if (quantity && amount) {
        const rate = +(amount / quantity).toFixed(2);
        line_items.push({ name: mg[2].trim(), quantity, rate });
      }
    }
  }

  // ── total ──
  const total = pickTotal(text, lines);

  // ── tax info ──
  const taxInfo = guessTaxInfo(text);
  let { tax_percent, tax_name } = taxInfo;
  if (!tax_percent) {
    const taxable = line_items.reduce((s, i) => s + i.quantity * i.rate, 0);
    if (taxable && total > taxable) tax_percent = ((total - taxable) / taxable) * 100;
    tax_percent = snapSlab(tax_percent);
  }

  return { vendor_name, gstin, gstins, invoice_no, date, line_items, tax_percent, tax_name, total, _garbage: isGarbage };
}

// ──────────────────────────── REGEX ────────────────────────────
async function viaRegex(file, trimmed) {
  const raw = (await pdf(trimmed.bytes)).text;
  const parsed = cleanExtractedText(raw);
  if (!parsed) return null;
  const { cleaned: t } = parsed;

  const invoice_no = pickInvoiceNo(t);

  const rawDate =
    (/(?:Dated|Date|Invoice\s*Date)\s*[:\-]?\s*(\d{1,2}[\-\/ ][A-Za-z0-9]{2,}[\-\/ ]\d{2,4})/i.exec(t) || [])[1] || '';
  const date = iso(rawDate) || findDate(rawDate) || '';

  const vendor_name = guessVendorFromText(t);
  const gstins = extractGstins(t);
  const gstin = pickSellerGstin(t, gstins);
  const total = pickTotal(t);
  const { tax_percent, tax_name } = guessTaxInfo(t);

  // Legacy HSN line-item pattern.
  const li = /(\d{6,8})\s+(\d+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,]+\.\d{2})/.exec(t);
  const name = /\n\s*1\s+(.+?)\s+\d{6,8}\s/.exec(t);

  return {
    vendor_name,
    gstin,
    gstins,
    invoice_no,
    date,
    line_items: li ? [{ name: name?.[1] || 'Goods/Services', quantity: num(li[2]), rate: num(li[4]) }] : [],
    tax_percent,
    tax_name,
    total,
  };
}

// ──────────────────────────── MERGE ────────────────────────────
function pick(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (typeof v === 'number' && (!Number.isFinite(v) || v === 0)) continue;
    return v;
  }
  return vals.find((v) => v != null) ?? '';
}

function pickGstin(...vals) {
  const valid = vals.find((v) => typeof v === 'string' && VALID_GSTIN.test(v.trim()));
  return (valid || pick(...vals) || '').toUpperCase();
}

// ── Focused OCR of the top band of an image (letterhead region) ──
// Runs three preprocessing variants and concatenates the results so
// the caller can find the vendor banner and seller GSTIN even when the
// full-page OCR missed them.
async function ocrHeaderRegion(file, topFrac = 0.35) {
  const meta = await sharp(file).rotate().metadata();
  const W = meta.width;
  const H = meta.height;
  const hh = Math.max(240, Math.floor(H * topFrac));

  const base = sharp(file).rotate().extract({ left: 0, top: 0, width: W, height: hh });

  // (A) green channel + hard threshold — red ink -> near-black, light blue -> white
  const vA = await base.clone().extractChannel('green')
    .resize({ width: 3200 }).normalise().sharpen().threshold(170).png().toBuffer();

  // (B) grayscale + threshold — best when the header is already black ink
  const vB = await base.clone().grayscale()
    .resize({ width: 3200 }).normalise().sharpen().threshold(150).png().toBuffer();

  // (C) grayscale, no threshold — softer, keeps anti-aliased red ink
  const vC = await base.clone().grayscale()
    .resize({ width: 3200 }).normalise().sharpen().png().toBuffer();

  const worker = await getWorker();
  const parts = await Promise.all([vA, vB, vC].map(async (buf) => {
    try { return (await worker.recognize(buf)).data.text; } catch { return ''; }
  }));
  return parts.join('\n');
}

// Strip an accidental "Invoice# " prefix that sometimes leaks into vendor_name.
const cleanVendor = (v) => typeof v === 'string' ? v.replace(/^\s*Invoice\s*#?.*$/i, '').trim() : v;

function mergeResults(gem, tess, reg) {
  const g = gem || {};
  const t = tess || {};
  const r = reg || {};

  // Debug dump (kept on for now — comment out if noisy).
  console.log('gemini ', g);
  console.log('tess   ', t);
  console.log('regex  ', r);

  // Seller GSTIN: prefer the explicit `gstin` from any source, then fall back
  // to the first element of any `gstins` array.
  const gstin = pickGstin(
    g.gstin, t.gstin, r.gstin,
    (g.gstins || [])[0], (t.gstins || [])[0], (r.gstins || [])[0]
  );

  // All GSTINs: union from every source, validate, normalise case.
  const allGstins = [...new Set([
    ...(g.gstins || []),
    ...(t.gstins || []),
    ...(r.gstins || []),
    ...(g.gstin ? [g.gstin] : []),
    ...(t.gstin ? [t.gstin] : []),
    ...(r.gstin ? [r.gstin] : []),
  ])]
    .filter((v) => typeof v === 'string' && VALID_GSTIN.test(v.trim()))
    .map((v) => v.toUpperCase());

  return {
    vendor_name: cleanVendor(pick(g.vendor_name, t.vendor_name, r.vendor_name)),
    gstin,
    gstins: allGstins,
    invoice_no: pick(g.invoice_no, t.invoice_no, r.invoice_no),
    date: pick(g.date, t.date, r.date),
    tax_percent: pick(g.tax_percent, t.tax_percent, r.tax_percent),
    tax_name: pick(g.tax_name, t.tax_name, r.tax_name) || '',
    tax_amount: pick(g.tax_amount, t.tax_amount, r.tax_amount),
    discount_amount: pick(g.discount_amount, t.discount_amount, r.discount_amount) || 0,
    discount_percent: pick(g.discount_percent, t.discount_percent, r.discount_percent) || 0,
    total: pick(g.total, t.total, r.total),
    line_items: g.line_items?.length ? g.line_items
      : t.line_items?.length ? t.line_items
        : (r.line_items || []),
    _sources: {
      gemini: !!gem,
      tesseract: !!tess,
      regex: !!reg,
      garbagePdf: !!(tess && tess._garbage),
    },
  };
}

// ──────────────────────────── ENTRY ────────────────────────────
export async function extract(file, mimeType = 'application/pdf') {
  const isPdf = !mimeType?.startsWith('image/');
  const trimmed = isPdf ? await trimPdf(file, 2, 2) : null;

  // Run all extractors in parallel; isolate failures.
  const [gem, tess, reg] = await Promise.all([
    process.env.GEMINI_API_KEY
      ? viaGemini(file, mimeType, trimmed).catch((e) => { console.warn('Gemini failed:', e.message); return null; })
      : Promise.resolve(null),

    viaTesseract(file, mimeType, trimmed).catch((e) => { console.warn('Tesseract failed:', e.message); return null; }),

    isPdf
      ? viaRegex(file, trimmed).catch((e) => { console.warn('Regex failed:', e.message); return null; })
      : Promise.resolve(null),

    // Uncomment if you want Claude as another source (highest priority — reorder below):
    // process.env.ANTHROPIC_API_KEY
    //   ? viaClaude(file, mimeType).catch(e => { console.warn('Claude failed:', e.message); return null; })
    //   : Promise.resolve(null),
  ]);

  return mergeResults(gem, tess, reg);
}

// Re-exports for testing.
export {
  viaGemini, viaTesseract, viaRegex, viaClaude, trimPdf, mergeResults,
  guessVendorFromText, pickSellerGstin, pickInvoiceNo, pickTotal, guessTaxPercent, guessTaxInfo,
  extractGstins, repairGstinCandidate,
};