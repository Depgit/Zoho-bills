// extract.js — Tesseract + regex → Gemini (free tier) invoice extractor
//
// Flow:
//   1. Tesseract reads ALL text from the document (local, free)
//        PDF   → first 2 + last 2 pages by default, or every page with { pages: 'all' }
//                (embedded text layer, else OCR)
//        Image → whole image
//   2. Regex pre-extracts fields from that text (GSTIN, bill no, date, tax, total)
//   3. OCR text + regex fields go to Gemini, DeepSeek AND Groq (in parallel) as TEXT —
//      none of them ever sees the document; one attempt each, no retries
//   4. Results are combined field by field, in priority order:
//        Gemini → DeepSeek → Groq → regex
//        - if all AIs fail, the regex parse is returned (source: 'tesseract')
//        - if OCR finds no text, no AI is called (source: 'failed')
//
// Saves free-tier quota by:
//   1. Same file uploaded again          → returned from cache, no API call
//   2. Same file uploaded at same moment → shares one API call
//   3. Calls go one at a time with a gap → avoids 429 rate-limit errors
// And flags duplicate bills (same seller GSTIN + invoice no, even if re-photographed).
//
// npm install @google/genai pdf-lib dotenv tesseract.js sharp pdf-parse pdf-to-img
// .env:
//   GEMINI_API_KEY=your_key
//   GEMINI_MODEL=gemini-flash-latest        (optional)
//   GEMINI_MIN_GAP_MS=4500                  (optional, ~13 calls/min)
//   DEEPSEEK_API_KEY=your_key               (optional, skipped if missing)
//   DEEPSEEK_MODEL=deepseek-chat            (optional)
//   GROQ_API_KEY=your_key                   (optional, skipped if missing)
//   GROQ_MODEL=openai/gpt-oss-120b          (optional)
//   EXTRACT_STORE=./data/extract-store.json (optional)
//   EXTRACT_CACHE=off                       (optional, default on — off = always extract fresh,
//                                            never read/write the store)
//   DEBUG_OCR=1                             (optional, logs OCR text)

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { pdf as pdfToImg } from 'pdf-to-img';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

// ─────────────────────────── config ───────────────────────────
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MIN_GAP_MS = Number(process.env.GEMINI_MIN_GAP_MS || 4500);
const STORE_FILE = process.env.EXTRACT_STORE || './data/extract-store.json';
const USE_CACHE = !/^(off|false|0|no)$/i.test(process.env.EXTRACT_CACHE || '');

const GSTIN_RE_STR = '\\d{2}[A-Z]{5}\\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]';
const VALID_GSTIN = new RegExp(`^${GSTIN_RE_STR}$`, 'i');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────── store ───────────────────────────
// Simple JSON-file store. To use MongoDB instead, replace these three
// methods with collection lookups — nothing else in the file changes.
//   byHash:    sha256(file)        → extracted data
//   byInvoice: "GSTIN|INVOICE_NO"  → { hash, data }
const store = {
  _data: null,
  _load() {
    if (this._data) return this._data;
    try {
      this._data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    } catch {
      this._data = { byHash: {}, byInvoice: {} };
    }
    return this._data;
  },
  _save() {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    const tmp = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2));
    fs.renameSync(tmp, STORE_FILE); // atomic replace, no half-written file
  },
  getByHash(hash) { return this._load().byHash[hash] || null; },
  getByInvoice(key) { return this._load().byInvoice[key] || null; },
  save(hash, invoiceKey, data) {
    const d = this._load();
    d.byHash[hash] = data;
    if (invoiceKey && !d.byInvoice[invoiceKey]) d.byInvoice[invoiceKey] = { hash, data };
    this._save();
  },
};

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function invoiceKey(data) {
  if (!data?.gstin || !data?.invoice_no) return null;
  const inv = String(data.invoice_no).toUpperCase().replace(/\s+/g, '');
  return `${data.gstin}|${inv}`;
}

// ─────────────────────────── queue ───────────────────────────
// Runs Gemini calls one at a time, at least MIN_GAP_MS apart,
// so parallel uploads don't blow through the per-minute limit.
let chain = Promise.resolve();
let lastCallAt = 0;

function enqueue(fn) {
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {}); // one failure must not block the queue
  return run;
}

// ─────────────────── trim PDF: keep first 2 + last 2 pages ───────────────────
async function trimPdf(filePath, firstN = 2, lastN = 2) {
  const raw = fs.readFileSync(filePath);
  try {
    const doc = await PDFDocument.load(raw, { ignoreEncryption: true });
    const total = doc.getPageCount();

    if (total <= firstN + lastN) {
      return { base64: raw.toString('base64'), bytes: raw, total, kept: total };
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
    return { base64: bytes.toString('base64'), bytes, total, kept: unique.length };
  } catch (e) {
    console.warn('[trimPdf] failed, sending full PDF:', e.message);
    return { base64: raw.toString('base64'), bytes: raw };
  }
}

// ──────────────────────────── prompt ────────────────────────────
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
    { "name": "item description", "quantity": 1, "rate": 0.00 }
  ]
}`;

function extractJson(raw) {
  const cleaned = String(raw || '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in response: ${cleaned.slice(0, 200)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ──────────────────────────── Gemini ────────────────────────────
let ai;
function client() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

// Text mode (default): OCR text + regex fields only, no file.
const TEXT_INTRO = `You are given the raw OCR text of an invoice (not the image). OCR may mis-read
characters (O↔0, I↔1, S↔5, B↔8) and break table rows across lines — use context to correct them.
If a field is genuinely not in the text, leave it empty / 0.\n\n`;

// Same text prompt for Gemini and DeepSeek.
function textPrompt(ocrText, regexFields) {
  return TEXT_INTRO + PROMPT
    + `\n\nFields pre-extracted by regex (may be wrong or incomplete — verify against the text):\n${JSON.stringify(regexFields ?? {}, null, 2)}`
    + `\n\nDocument text (Tesseract OCR):\n-----\n${ocrText.slice(0, 30000)}\n-----`;
}

async function viaGeminiText(ocrText, regexFields) {
  return askGemini([{ text: textPrompt(ocrText, regexFields) }]);
}

// ─────────────────── DeepSeek / Groq (OpenAI-compatible) ───────────────────
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function chatJson(name, url, apiKey, model, ocrText, regexFields) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You extract structured data from Indian GST tax invoices. Reply with ONLY valid JSON.' },
        { role: 'user', content: textPrompt(ocrText, regexFields) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8000,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    const err = new Error(`${name} HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  const json = await r.json();
  return extractJson(json?.choices?.[0]?.message?.content);
}

const viaDeepSeekText = (ocrText, regexFields) => chatJson(
  'DeepSeek', 'https://api.deepseek.com/chat/completions',
  process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL, ocrText, regexFields,
);

const viaGroqText = (ocrText, regexFields) => chatJson(
  'Groq', 'https://api.groq.com/openai/v1/chat/completions',
  process.env.GROQ_API_KEY, GROQ_MODEL, ocrText, regexFields,
);

// Priority order: earlier providers win, later ones only fill empty fields.
const PROVIDERS = [
  { name: 'gemini', key: 'GEMINI_API_KEY', model: MODEL, run: (...a) => viaGeminiText(...a) },
  { name: 'deepseek', key: 'DEEPSEEK_API_KEY', model: DEEPSEEK_MODEL, run: viaDeepSeekText },
  { name: 'groq', key: 'GROQ_API_KEY', model: GROQ_MODEL, run: viaGroqText },
];

async function askGemini(parts) {
  const res = await enqueue(() => client().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
      maxOutputTokens: 8192, // room for "thinking" + long item lists
    },
  }));

  const text = res.text ?? '';
  if (!text.trim()) {
    const reason = res.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned empty response (finishReason: ${reason ?? 'unknown'})`);
  }
  return extractJson(text);
}

// ──────────────────────────── Tesseract ────────────────────────────
let workerPromise;
const getWorker = () => (workerPromise ??= (async () => {
  const w = await Tesseract.createWorker('eng');
  await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return w;
})());

// Grayscale, upscale, normalise contrast → much better OCR on phone photos.
const preprocess = (input) => sharp(input)
  .rotate().grayscale().resize({ width: 2400 }).normalise().sharpen().png().toBuffer();

async function ocrImage(input) {
  const worker = await getWorker();
  return (await worker.recognize(await preprocess(input))).data.text;
}

// A text layer that's mostly single characters is barcode/CMap garbage.
function looksLikeGarbage(text) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  if (tokens.length < 30) return true;
  return tokens.filter((t) => t.length === 1).length / tokens.length > 0.4;
}

// PDF: use the embedded text layer if it's usable, else render pages and OCR them.
async function ocrPdf(bytes) {
  try {
    const text = (await pdfParse(bytes)).text;
    if (!looksLikeGarbage(text)) return text;
  } catch (e) {
    console.warn('[tesseract] pdf-parse failed:', e.message);
  }
  let out = '';
  for await (const page of await pdfToImg(bytes, { scale: 2 })) out += `${await ocrImage(page)}\n`;
  return out;
}

async function ocrText(file, mimeType, trimmed) {
  const text = mimeType?.startsWith('image/')
    ? await ocrImage(file)
    : await ocrPdf((trimmed ?? await trimPdf(file, 2, 2)).bytes);
  const cleaned = String(text || '').replace(/[|]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  if (process.env.DEBUG_OCR) console.log('=== OCR ===\n' + cleaned);
  return cleaned;
}

// ── regex parse of OCR text (fallback / gap-filler) ──
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const SLABS = [0, 0.25, 3, 5, 12, 18, 28];
const snapSlab = (p) => SLABS.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));

// GSTIN layout: d d L L L L L d d d d L a Z a — fix common OCR digit/letter swaps.
const GSTIN_LAYOUT = 'ddLLLLLddddLaZa';
const OCR_TO_DIGIT = { O: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6', D: '0', Q: '0', T: '7' };
const OCR_TO_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z', 6: 'G' };

function repairGstin(tok) {
  if (tok?.length !== 15) return '';
  let out = '';
  for (let i = 0; i < 15; i++) {
    const ch = tok[i].toUpperCase();
    const kind = GSTIN_LAYOUT[i];
    out += kind === 'd' ? (OCR_TO_DIGIT[ch] || ch) : kind === 'L' ? (OCR_TO_LETTER[ch] || ch) : kind === 'Z' ? 'Z' : ch;
  }
  return VALID_GSTIN.test(out) ? out : '';
}

function findDate(text) {
  const re = /(\d{1,2})[\s\-\/.]([A-Za-z]{3}|\d{1,2})[a-z]*[\s\-\/.](\d{4}|\d{2})\b/g;
  for (const m of String(text || '').matchAll(re)) {
    const d = +m[1];
    const mo = isNaN(m[2]) ? MON[m[2].toLowerCase()] : +m[2];
    let y = +m[3]; if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return '';
}

// Bill / invoice number. Covers "Invoice No", "Bill No", "Inv. No.", "Invoice #",
// "Bill Number", "Receipt No", "Voucher No", "Document No", "Ref No"…, with the
// value on the same line or the next one. Value must contain a digit and not be a date.
const INVOICE_LABEL = String.raw`(?:Tax\s*)?(?:Invoice|Inv|Bill|Receipt|Voucher|Document|Doc|Ref(?:erence)?)\.?\s*(?:No\.?|Num(?:ber)?\.?|#|Id)`;
const INVOICE_VALUE = String.raw`([A-Z0-9][A-Z0-9\/\-_.]{0,29})`;
const INVOICE_PATTERNS = [
  new RegExp(`\\b${INVOICE_LABEL}\\s*[:#.\\-]?[ \\t]*${INVOICE_VALUE}`, 'gi'),       // same line
  new RegExp(`\\b${INVOICE_LABEL}\\s*[:#.\\-]?[ \\t]*\\n[ \\t]*${INVOICE_VALUE}`, 'gi'), // next line
  /\b([A-Z]{2,6}\/\d{2}-\d{2}\/\d{3,})\b/g,  // YCS/26-27/028915
  /\b([A-Z]{2,5}-?\d{2,4}[\/-]\d{3,})\b/g,       // INV-2024/0012
];

function pickInvoiceNo(text) {
  if (!text) return '';
  for (const re of INVOICE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const v = m[1].replace(/[.\-\/]+$/, '').toUpperCase();
      if (/\d/.test(v) && !findDate(v) && !VALID_GSTIN.test(v)) return v;
    }
  }
  return '';
}

function parseOcr(text) {
  if (!text) return null;
  const money = (s) => Number(String(s).replace(/,/g, '')) || 0;

  const gstins = [...new Set(
    (text.match(/\b[0-9A-Za-z]{15}\b/g) || []).map(repairGstin).filter(Boolean),
  )];
  // Seller = GSTIN next to a plain "GSTIN" label (not "GSTIN Cust"), else the first one.
  const sellerTok = /\bGSTIN\b(?!\s*:?\s*Cust)[\s:\-]*([0-9A-Za-z]{15})/i.exec(text)?.[1];
  const gstin = repairGstin(sellerTok) || gstins[0] || '';

  const invoice_no = pickInvoiceNo(text);

  const dateLine = /(?:Invoice\s*Date|Date)\s*[:\-]?\s*([^\n]{0,30})/i.exec(text)?.[1];
  const date = findDate(dateLine) || findDate(text);

  const rate = (re) => +(re.exec(text)?.[1] || 0);
  const igst = rate(/IGST\s*@?\s*\(?(\d+(?:\.\d+)?)/i);
  const cgst = rate(/CGST\s*@?\s*\(?(\d+(?:\.\d+)?)/i);
  const sgst = rate(/SGST\s*@?\s*\(?(\d+(?:\.\d+)?)/i);
  let tax_percent = 0; let tax_name = '';
  if (igst) { tax_percent = snapSlab(igst); tax_name = `IGST${tax_percent}`; }
  else if (cgst && sgst) { tax_percent = snapSlab(cgst + sgst); tax_name = `CGST${tax_percent / 2}+SGST${tax_percent / 2}`; }

  const totalM = /(?:Grand\s*Total|Net\s*Payable|Balance\s*Due|Total\s*Amount|^\s*Total)\b[^\d\n]*([\d,]+\.\d{2})/im.exec(text);
  const amounts = (text.match(/\d[\d,]*\.\d{2}/g) || []).map(money);
  const total = totalM ? money(totalM[1]) : (amounts.length ? Math.max(...amounts) : 0);

  return { gstin, gstins, invoice_no, date, tax_percent, tax_name, total };
}

// Combine two normalised results: keep `primary`, fill its empty fields from `secondary`.
// Returns the merged result and the list of fields taken from `secondary`.
function combine(primary, secondary) {
  const out = { ...primary };
  const filled = [];
  for (const [k, v] of Object.entries(secondary)) {
    if (k === 'gstins') continue;
    const empty = Array.isArray(out[k]) ? out[k].length === 0 : !out[k];
    const has = Array.isArray(v) ? v.length > 0 : Boolean(v);
    if (empty && has) { out[k] = v; filled.push(k); }
  }
  out.gstins = [...new Set([...(primary.gstins || []), ...(secondary.gstins || [])])];
  return { data: out, filled };
}

// Keep the AI values; fill only what they left empty from the regex parse.
function fillGaps(primary, ocr) {
  if (!ocr) return primary;
  const out = { ...primary };
  for (const k of ['gstin', 'invoice_no', 'date', 'tax_name', 'tax_percent', 'total']) {
    if (!out[k] && ocr[k]) out[k] = ocr[k];
  }
  out.gstins = [...new Set([...(out.gstins || []), ...(ocr.gstins || [])])];
  return out;
}

// ──────────────────────────── normalise ────────────────────────────
function normalise(raw) {
  const r = raw || {};

  const allGstins = [...new Set(
    [...(Array.isArray(r.gstins) ? r.gstins : []), ...(r.gstin ? [r.gstin] : [])]
      .filter((v) => typeof v === 'string' && VALID_GSTIN.test(v.trim()))
      .map((v) => v.trim().toUpperCase()),
  )];

  const gstin = typeof r.gstin === 'string' && VALID_GSTIN.test(r.gstin.trim())
    ? r.gstin.trim().toUpperCase()
    : allGstins[0] || '';

  const num = (v) => Number(String(v ?? '').replace(/[₹,\s]/g, '')) || 0;

  return {
    vendor_name: typeof r.vendor_name === 'string'
      ? r.vendor_name.replace(/^\s*Invoice\s*#?.*$/i, '').trim()
      : '',
    gstin,
    gstins: allGstins,
    invoice_no: String(r.invoice_no || '').trim(),
    date: r.date || '',
    tax_percent: num(r.tax_percent),
    tax_name: r.tax_name || '',
    tax_amount: num(r.tax_amount),
    discount_amount: num(r.discount_amount),
    discount_percent: num(r.discount_percent),
    total: num(r.total),
    line_items: Array.isArray(r.line_items)
      ? r.line_items.map((it) => ({
        name: it?.name || '',
        quantity: num(it?.quantity),
        rate: num(it?.rate),
      }))
      : [],
  };
}

// A result worth caching has at least some real content.
function isUseful(d) {
  return Boolean(d.gstin || d.invoice_no || d.total);
}

// ──────────────────────────── entry ────────────────────────────
const inFlight = new Map(); // hash → Promise, so identical uploads share one call

/**
 * Full result with metadata.
 * @param {{ pages?: 'trim'|'all' }} opts  PDF only: 'trim' = first 2 + last 2 pages (default), 'all' = every page.
 *   The two modes are cached separately, so the same PDF can be compared in both.
 * @returns {{ data, source: 'cache'|'gemini'|'deepseek'|'groq'|'tesseract'|'failed', duplicate: boolean, hash: string }}
 *   source = the highest-priority AI that answered (lower ones may have filled gaps).
 *   pdfPages = { mode, read, total } for PDFs (read/total missing on a cache hit).
 *   duplicate = true → this file or this seller + invoice no was already
 *               processed; data is the earlier saved copy.
 */
export async function extractWithMeta(file, mimeType = 'application/pdf', { pages = 'trim' } = {}) {
  if (!PROVIDERS.some((p) => process.env[p.key])) {
    throw new Error(`Missing all AI keys (${PROVIDERS.map((p) => p.key).join(', ')})`);
  }

  const isPdf = !mimeType?.startsWith('image/');
  const allPages = isPdf && pages === 'all';
  const ns = allPages ? ':all' : ''; // whole-PDF results live in their own cache slots
  const hash = fileHash(file);
  const cacheKey = hash + ns;
  let pdfPages = isPdf ? { mode: allPages ? 'all' : 'trim' } : undefined;

  // 1. Exact same file seen before → no API call
  const cached = USE_CACHE && store.getByHash(cacheKey);
  if (cached) {
    console.log(`[extract] cache hit ${cacheKey.slice(0, 10)}${ns}`);
    return { data: cached, source: 'cache', duplicate: true, hash, pdfPages };
  }

  // 2. Same file already being processed right now → wait for that call
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const job = (async () => {
    // PDF bytes handed to OCR: first 2 + last 2 pages, or the whole file
    let trimmed = null;
    if (allPages) {
      const raw = fs.readFileSync(file);
      const total = await PDFDocument.load(raw, { ignoreEncryption: true })
        .then((d) => d.getPageCount()).catch(() => undefined);
      trimmed = { bytes: raw, total, kept: total };
    } else if (isPdf) {
      trimmed = await trimPdf(file, 2, 2);
    }
    if (isPdf) {
      pdfPages = { ...pdfPages, read: trimmed.kept, total: trimmed.total };
      console.log(`[extract] PDF pages (${pdfPages.mode}): ${pdfPages.read ?? '?'} / ${pdfPages.total ?? '?'}`);
    }

    // 1. Tesseract: all text from the document
    let ocr = '';
    try {
      ocr = await ocrText(file, mimeType, trimmed);
      console.log(`[tesseract] ${ocr.length} chars`);
    } catch (e) {
      console.warn('[tesseract] FAILED:', e.message);
    }
    if (!ocr) return { data: normalise(null), source: 'failed', duplicate: false, hash, pdfPages };

    // 2. Regex: pre-extract fields from that text
    const ocrParsed = parseOcr(ocr);
    if (ocrParsed) console.log('[regex]', ocrParsed);

    // 3. All AIs in parallel: text in → fields out (one attempt each, no document)
    const active = PROVIDERS.filter((p) => process.env[p.key]);
    console.log('[extract] AI (ocr text):', Object.fromEntries(
      PROVIDERS.map((p) => [p.name, process.env[p.key] ? p.model : 'off']),
    ));

    const settled = await Promise.allSettled(active.map((p) => p.run(ocr, ocrParsed)));

    // 4. Combine in priority order: Gemini → DeepSeek → Groq (→ regex below)
    let data;
    let source;
    settled.forEach((res, i) => {
      const { name } = active[i];
      if (res.status === 'rejected') {
        console.error(`[${name}] FAILED:`, res.reason?.status ?? '', res.reason?.message);
        return;
      }
      const result = normalise(res.value);
      console.log(`[${name}] result:`, JSON.stringify(result, null, 2));
      if (!data) {
        data = result;
        source = name;
        return;
      }
      const merged = combine(data, result);
      if (merged.filled.length) console.log(`[extract] filled from ${name}:`, merged.filled.join(', '));
      data = merged.data;
    });

    if (data) {
      data = normalise(fillGaps(data, ocrParsed));
    } else {
      data = normalise(ocrParsed);
      source = isUseful(data) ? 'tesseract' : 'failed';
      if (source === 'failed') return { data, source, duplicate: false, hash, pdfPages };
      console.log('[extract] using Tesseract fallback');
    }

    // Don't cache empty or OCR-only results, so re-uploading can still reach the AI
    if (!USE_CACHE || !isUseful(data) || source === 'tesseract') {
      return { data, source, duplicate: false, hash, pdfPages };
    }

    // 3. Same bill as an earlier, different file (re-scan / re-photo)
    const key = invoiceKey(data) && invoiceKey(data) + ns;
    const earlier = key && store.getByInvoice(key);

    store.save(cacheKey, key, earlier ? earlier.data : data);

    if (earlier) {
      console.log(`[extract] duplicate bill ${key}`);
      return { data: earlier.data, source, duplicate: true, hash, pdfPages };
    }
    return { data, source, duplicate: false, hash, pdfPages };
  })();

  inFlight.set(cacheKey, job);
  try {
    return await job;
  } finally {
    inFlight.delete(cacheKey);
  }
}

/** Same signature and return shape as before: just the extracted data. */
export async function extract(file, mimeType = 'application/pdf', opts = {}) {
  const { data } = await extractWithMeta(file, mimeType, opts);
  console.log('grok data', data);
  return data;
}

export { viaGeminiText, viaDeepSeekText, viaGroqText, combine, trimPdf, normalise, ocrText, parseOcr };