// Invoice extraction: OCR → regex → AI race → cleaned result.
//
//   1. The document's text: a PDF with a text layer is read in full, straight from the file
//      (pdftotext -layout, else pdf.js); scanned PDFs and photos go through Tesseract
//      (PDF: first 2 + last 2 pages, or all with { pages: 'all' })
//   2. Regex pre-extracts GSTIN, bill no, date, tax %, total
//   3. OCR text + regex fields go to Gemini, DeepSeek and Groq in parallel (text only, one attempt each);
//      the first usable answer wins, regex fills whatever it left empty
//      - every AI fails → the regex parse is returned (source: 'tesseract')
//      - OCR finds no text → no AI is called (source: 'failed')
//
// Saves free-tier quota: the same file again is served from the cache, the same file at the same
// moment shares one call, and Gemini calls are spaced out. Same seller GSTIN + invoice no
// (even re-photographed) is flagged as a duplicate.
import { DEBUG_OCR } from '../../config/env.js';
import { activeProviders, PROVIDERS, raceProviders } from '../../integrations/ai/index.js';
import { readDocument } from '../../integrations/ocr/index.js';
import { USE_CACHE } from './config.js';
import { cache, fileHash, invoiceKey } from './cache.js';
import { parseOcr } from './parseOcr.js';
import { fillGaps, isUseful, normalise } from './normalise.js';
import { timer } from './timing.js';

// What counts as a usable AI answer
const judge = (raw) => {
  const data = normalise(raw);
  return { data, usable: isUseful(data) };
};

const inFlight = new Map(); // cache key → Promise, so identical uploads share one call

/**
 * @param {object} opts
 *   pages:   'trim' (default) | 'all' — which pages of a SCANNED PDF get OCR'd (text PDFs are always read in full)
 *   fewShot: optional async (regexFields, ocrText) => prompt block of earlier examples
 * @returns {{ data, source, duplicate, hash, pdfPages, ocrText }}
 *   source: 'cache' | 'gemini' | 'deepseek' | 'groq' | 'tesseract' | 'failed'
 *   duplicate: this file, or this seller + invoice no, was processed before (data = earlier copy)
 */
export async function extractWithMeta(file, mimeType = 'application/pdf', { pages = 'trim', fewShot } = {}) {
  if (!activeProviders().length) {
    throw new Error(`Missing all AI keys (${PROVIDERS.map((p) => p.key).join(', ')})`);
  }

  const isPdf = !mimeType?.startsWith('image/');
  const allPages = isPdf && pages === 'all';
  const ns = allPages ? ':all' : ''; // whole-PDF results live in their own cache slots
  const hash = fileHash(file);
  const cacheKey = hash + ns;
  const baseMeta = { hash, pdfPages: isPdf ? { mode: allPages ? 'all' : 'trim' } : undefined };

  const cached = USE_CACHE && (await cache.getByHash(cacheKey));
  if (cached) {
    if (DEBUG_OCR) console.log(`[extract] cache hit ${cacheKey.slice(0, 10)}${ns}`);
    return { data: cached, source: 'cache', duplicate: true, ...baseMeta };
  }
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const job = run(file, mimeType, { isPdf, allPages, ns, cacheKey, fewShot, baseMeta });
  inFlight.set(cacheKey, job);
  try {
    return await job;
  } finally {
    inFlight.delete(cacheKey);
  }
}

async function run(file, mimeType, { isPdf, allPages, ns, cacheKey, fewShot, baseMeta }) {
  const t = timer();
  const meta = { ...baseMeta };

  // 1. Text: PDF text layer (every page) or OCR
  let ocr = '';
  const ocrStart = Date.now();
  try {
    const doc = await readDocument(file, mimeType, { scannedPages: allPages ? 'all' : 'trim' });
    ocr = doc.text;
    t.took[doc.method] = t.since(ocrStart);
    if (isPdf) {
      const mode = doc.method === 'tesseract' ? (allPages ? 'all' : 'trim') : 'text';
      meta.pdfPages = { mode, method: doc.method, ...doc.pages };
    }
  } catch (e) {
    console.warn('[read] FAILED:', e.message);
  }
  if (!ocr) {
    t.log('failed');
    return { data: normalise(null), source: 'failed', duplicate: false, ...meta };
  }
  const withText = { ...meta, ocrText: ocr };

  // 2. Regex (on a single-spaced copy — the AI gets the text with its column layout)
  const regex = parseOcr(ocr.replace(/[ \t]+/g, ' '));
  if (DEBUG_OCR) console.log('[regex]', regex);

  // 3. AI race, with few-shot examples of earlier approved invoices
  let examples = '';
  if (fewShot) {
    try {
      examples = await fewShot(regex, ocr);
    } catch (e) {
      console.warn('[extract] fewShot failed:', e.message);
    }
  }
  const answer = await raceProviders(activeProviders(), { ocrText: ocr, regexFields: regex, examples }, judge, t.took);
  t.log(answer?.source || 'tesseract');

  let data;
  let source;
  if (answer) {
    data = normalise(fillGaps(answer.data, regex));
    source = answer.source;
  } else {
    data = normalise(regex);
    source = isUseful(data) ? 'tesseract' : 'failed';
    if (source === 'failed') return { data, source, duplicate: false, ...withText };
  }

  // Don't cache empty or OCR-only results, so re-uploading can still reach the AI
  if (!USE_CACHE || !isUseful(data) || source === 'tesseract') {
    return { data, source, duplicate: false, ...withText };
  }

  // Same bill as an earlier, different file (re-scan / re-photo)
  const key = invoiceKey(data) && invoiceKey(data) + ns;
  const earlier = key && (await cache.getByInvoice(key));
  await cache.save(cacheKey, key, earlier ? earlier.data : data);
  if (earlier) {
    if (DEBUG_OCR) console.log(`[extract] duplicate bill ${key}`);
    return { data: earlier.data, source, duplicate: true, ...withText };
  }
  return { data, source, duplicate: false, ...withText };
}
