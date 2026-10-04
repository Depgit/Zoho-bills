// Invoice extraction: OCR → regex → AI race → cleaned result.
//
//   1. Tesseract reads the document text (PDF: first 2 + last 2 pages, or all with { pages: 'all' })
//   2. Regex pre-extracts GSTIN, bill no, date, tax %, total
//   3. OCR text + regex fields go to Gemini, DeepSeek and Groq in parallel (text only, one attempt each);
//      the first usable answer wins, regex fills whatever it left empty
//      - every AI fails → the regex parse is returned (source: 'tesseract')
//      - OCR finds no text → no AI is called (source: 'failed')
//
// Saves free-tier quota: the same file again is served from the cache, the same file at the same
// moment shares one call, and Gemini calls are spaced out. Same seller GSTIN + invoice no
// (even re-photographed) is flagged as a duplicate.
import { DEBUG_OCR, USE_CACHE } from './config.js';
import { fileHash, invoiceKey, store } from './store.js';
import { trimPdf, wholePdf } from './pdf.js';
import { ocrText as readText } from './ocr.js';
import { parseOcr } from './parseOcr.js';
import { fillGaps, isUseful, normalise } from './normalise.js';
import { activeProviders, PROVIDERS } from './providers/index.js';
import { raceProviders, timer } from './race.js';

const inFlight = new Map(); // cache key → Promise, so identical uploads share one call

/**
 * @param {object} opts
 *   pages:   'trim' (default, first 2 + last 2 pages) | 'all' — PDFs only, cached separately
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

  const cached = USE_CACHE && store.getByHash(cacheKey);
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

  // PDF pages handed to OCR
  let pdfPages = null;
  if (isPdf) {
    pdfPages = allPages ? await wholePdf(file) : await trimPdf(file, 2, 2);
    meta.pdfPages = { ...meta.pdfPages, read: pdfPages.kept, total: pdfPages.total };
  }

  // 1. OCR
  let ocr = '';
  const ocrStart = Date.now();
  try {
    ocr = await readText(file, mimeType, pdfPages);
    t.took.ocr = t.since(ocrStart);
  } catch (e) {
    console.warn('[tesseract] FAILED:', e.message);
  }
  if (!ocr) {
    t.log('failed');
    return { data: normalise(null), source: 'failed', duplicate: false, ...meta };
  }
  const withText = { ...meta, ocrText: ocr };

  // 2. Regex
  const regex = parseOcr(ocr);
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
  const answer = await raceProviders(activeProviders(), ocr, regex, examples, t.took);
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
  const earlier = key && store.getByInvoice(key);
  store.save(cacheKey, key, earlier ? earlier.data : data);
  if (earlier) {
    if (DEBUG_OCR) console.log(`[extract] duplicate bill ${key}`);
    return { data: earlier.data, source, duplicate: true, ...withText };
  }
  return { data, source, duplicate: false, ...withText };
}
