import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';


const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = s => {
  const m = /(\d{1,2})[-\/ ]([a-z]{3})[a-z]*[-\/ ](\d{4})/i.exec(s || '');
  return m ? `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
// const num = s => parseFloat(String(s).replace(/,/g, ''));
const num = (s) => parseFloat(String(s ?? '').replace(/[₹,\s]/g, '')) || 0;

const PROMPT = `Extract this Indian GST tax invoice. Reply with ONLY JSON:
{"vendor_name":"seller name","gstin":"seller GSTIN","invoice_no":"","date":"YYYY-MM-DD",
"line_items":[{"name":"","quantity":0,"rate":0}],"tax_percent":0,"total":0}
"rate" is the per-unit rate EXCLUDING tax. "total" is the grand total including tax.`;

async function viaClaude(file, mimeType = 'application/pdf') {
  const isImage = mimeType?.startsWith('image/');
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  const contentBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: normalizedMime, data: fs.readFileSync(file).toString('base64') } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(file).toString('base64') } };

  const m = await new Anthropic().messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 1000,
    messages: [{
      role: 'user', content: [
        contentBlock,
        { type: 'text', text: PROMPT }]
    }]
  });
  return JSON.parse(m.content.map(x => x.text || '').join('').replace(/```json|```/g, '').trim());
}

async function viaGemini(file, mimeType = 'application/pdf') {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : (mimeType || 'application/pdf');
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    contents: [{
      role: 'user', parts: [
        { inlineData: { mimeType: normalizedMime, data: fs.readFileSync(file).toString('base64') } },
        { text: PROMPT }]
    }],
    config: { maxOutputTokens: 1000, responseMimeType: 'application/json' }
  });
  return JSON.parse(res.text.replace(/```json|```/g, '').trim());
}

// import fs from 'fs';
// import pdf from 'pdf-parse';
// import sharp from 'sharp';            // npm i sharp
// import Tesseract from 'tesseract.js';

// ---------- OCR worker (reused across calls) ----------
let workerPromise;
const getWorker = () => (workerPromise ??= (async () => {
  const w = await Tesseract.createWorker('eng');
  await w.setParameters({
    tessedit_pageseg_mode: '6',        // one uniform block: keeps table rows on one line
    preserve_interword_spaces: '1',    // keeps column gaps
  });
  return w;
})());

async function preprocess(file) {
  return sharp(file)
    .rotate()                                   // fix phone EXIF orientation
    .grayscale()
    .resize({ width: 2400 })                    // upscale small text
    .normalise()                                // stretch contrast, helps with shadows
    .sharpen()
    .png()
    .toBuffer();
}

// ---------- helpers ----------
// const num = (s) => parseFloat(String(s ?? '').replace(/[₹,\s]/g, '')) || 0;
const MONEY = /\d[\d,]*\.\d{2}/g;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_RE = /(\d{1,2})[\s\-\/.]([A-Za-z]{3}|\d{1,2})[\s\-\/.](\d{4}|\d{2})/g;

function findDate(str) {
  for (const m of str.matchAll(DATE_RE)) {
    const d = +m[1];
    const mo = isNaN(m[2]) ? MONTHS[m[2].toLowerCase()] : +m[2];
    let y = +m[3]; if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

const SLABS = [0, 0.25, 3, 5, 12, 18, 28];
const snapSlab = (p) => SLABS.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));

// ---------- main ----------
async function viaTesseract(file, mimeType = 'application/pdf') {
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : (mimeType || 'application/pdf');

  let text;
  if (normalizedMime === 'application/pdf') {
    text = (await pdf(fs.readFileSync(file))).text;
  } else {
    const worker = await getWorker();
    text = (await worker.recognize(await preprocess(file))).data.text;
  }
  text = text.replace(/[|]/g, ' ');                       // table borders become noise
  if (process.env.DEBUG_OCR) console.log(text);

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // vendor_name: Tally puts the seller name on the line just above "Consignee (Ship to)"
  const ci = lines.findIndex((l) => /^Consignee/i.test(l));
  let vendor_name = ci > 0 ? lines[ci - 1] : '';
  if (!vendor_name)
    vendor_name = (text.match(/A\/c Holder'?s Name\s*:\s*(.+)/i) || text.match(/^for\s+(.+)$/im) || [])[1] || '';
  vendor_name = vendor_name.split(/\s{2,}/)[0].replace(/\s*Invoice No.*$/i, '').trim();

  // gstin: seller's is labelled "Company's GSTIN/UIN"; first GSTIN in the text is the BUYER's
  const G = '\\d{2}[A-Z]{5}\\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]';
  const labelled = (text.match(new RegExp(`Company'?s\\s*GSTIN\\/?UIN\\s*[:\\-]?\\s*(${G})`, 'i')) || [])[1];
  const all = text.match(new RegExp(`\\b${G}\\b`, 'g')) || [];
  const gstin = (labelled || all[all.length - 1] || '').toUpperCase();

  // invoice_no: token after the "Invoice No" label that has a slash/digits and isn't a date
  const idx = text.search(/Invoice\s*No/i);
  const near = (idx >= 0 ? text.slice(idx + 10, idx + 250) : text).split(/\s+/);
  const ok = (t) => /^[A-Za-z0-9\/\-]{4,}$/.test(t) && /\d/.test(t) && !findDate(t);
  const invoice_no = near.find((t) => ok(t) && t.includes('/')) || near.find(ok) || '';

  // date: the first valid date after "Dated" (not the Ack Date)
  const dated = (text.match(/Dated[\s\S]{0,80}/i) || [''])[0];
  const date = findDate(dated) || findDate(text);

  // line_items: "1  <name>  <HSN>  <qty> PCS  [rate incl tax]  <rate>  PCS  <amount>"
  const line_items = [];
  for (const line of lines) {
    const m = line.match(/^(\d{1,2})\s+(.+?)\s+(\d{4,8})\s+([\d,.]+)\s*([A-Za-z]{2,5})\b(.*)$/);
    if (!m) continue;
    const quantity = num(m[4]);
    const nums = (m[6].match(MONEY) || []).map(num);
    if (!quantity || !nums.length) continue;
    const amount = nums[nums.length - 1];
    let rate = nums.length >= 2 ? nums[nums.length - 2] : 0;
    if (!rate || Math.abs(rate * quantity - amount) > 1) rate = +(amount / quantity).toFixed(2); // OCR-proof
    line_items.push({ name: m[2].trim(), quantity, rate });
  }

  // total: the largest money value on the page is the grand total
  const amounts = (text.match(MONEY) || []).map(num);
  const total = amounts.length ? Math.max(...amounts) : 0;

  // tax_percent: IGST alone, or CGST + SGST; fall back to (total - taxable) / taxable
  const pcts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => +m[1]).filter((p) => p <= 28);
  let tax_percent = /IGST/i.test(text) && !/CGST/i.test(text) ? (pcts[0] || 0) : (pcts[0] || 0) + (pcts[1] || 0);
  const taxable = line_items.reduce((s, i) => s + i.quantity * i.rate, 0);
  if (!tax_percent && taxable && total > taxable) tax_percent = ((total - taxable) / taxable) * 100;
  tax_percent = snapSlab(tax_percent);

  return { vendor_name, gstin, invoice_no, date, line_items, tax_percent, total };
}

async function viaRegex(file) {
  const t = (await pdf(fs.readFileSync(file))).text;
  const li = /(\d{6,8})\s+(\d+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,]+\.\d{2})/.exec(t);
  const name = /\n\s*1\s+(.+?)\s+\d{6,8}\s/.exec(t);
  return {
    vendor_name: (/Tax Invoice\s*\n\s*(.+)/i.exec(t) || [])[1]?.trim(),
    gstin: (/GSTIN\/UIN:\s*([0-9A-Z]{15})/i.exec(t) || [])[1],
    invoice_no: (/Invoice No\.?\s*\n?\s*([A-Z0-9\/\-]+)/i.exec(t) || [])[1],
    date: iso((/Dated\s*\n?\s*(\d{1,2}-[a-z]+-\d{4})/i.exec(t) || [])[1]),
    line_items: li ? [{ name: name?.[1] || 'Goods/Services', quantity: num(li[2]), rate: num(li[4]) }] : [],
    tax_percent: num((/(?:IGST|CGST|SGST)\s*(\d+(?:\.\d+)?)/i.exec(t) || [])[1] || 0),
    total: num((/Tota\w*\s*([\d,]+\.\d{2})/.exec(t) || [])[1] || 0)
  };
}

export async function extract(file, mimeType = 'application/pdf') {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await viaClaude(file, mimeType); } catch (e) { console.warn('Claude extract failed:', e.message); }
  }
  if (process.env.GEMINI_API_KEY) {
    try { return await viaGemini(file, mimeType); } catch (e) { console.warn('Gemini extract failed:', e.message); }
  }
  if (mimeType?.startsWith('image/')) {
    try { return await viaTesseract(file, mimeType); } catch (e) { console.warn('Tesseract extract failed:', e.message); }
  }
  return viaRegex(file);
}
