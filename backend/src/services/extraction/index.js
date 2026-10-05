// Invoice extraction: text → regex + table parser → (AI only if still needed) → cleaned result.
//
//   1. The document's text: a PDF with a text layer is read in full, straight from the file
//      (pdftotext -layout, else pdf.js); scanned PDFs and photos go through Tesseract
//      (PDF: first 2 + last 2 pages, or all with { pages: 'all' })
//   2. Regex extracts GSTIN, bill no, date, tax %, total
//   3. pdftotext text: the line-item table is parsed by column position (tableParser.js), checked
//      against the Sub Total. Table + GSTIN + bill no + total all found → done, NO AI (source: 'pdftotext')
//   4. Otherwise Gemini, DeepSeek and Groq get the text in parallel; the first usable answer wins,
//      regex fills whatever it left empty, and a parsed table still replaces the AI's line items
//      - every AI fails → the regex result is returned (source: 'regex', with aiErrors)
//      - no text at all → no AI is called (source: 'failed')
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
import { parseLineItems } from './tableParser.js';

// What counts as a usable AI answer
const judge = (raw) => {
  const data = normalise(raw);
  return { data, usable: isUseful(data) };
};

// Bump when the AI's answer shape changes, so older cached answers aren't reused
const CACHE_VERSION = 'v3'; // v3: line items from the pdftotext table

const inFlight = new Map(); // cache key → Promise, so identical uploads share one call

/**
 * @param {object} opts
 *   pages:   'trim' (default) | 'all' — which pages of a SCANNED PDF get OCR'd (text PDFs are always read in full)
 *   fewShot: optional async (regexFields, ocrText) => prompt block of earlier examples
 * @returns {{ data, source, duplicate, hash, pdfPages, ocrText }}
 *   source: 'cache' | 'pdftotext' (table + regex, no AI) | 'gemini' | 'deepseek' | 'groq' | 'regex' (AI failed) | 'failed'
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
  const cacheKey = `${CACHE_VERSION}:${hash}${ns}`;
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
  let doc = null;
  const ocrStart = Date.now();
  try {
    doc = await readDocument(file, mimeType, { scannedPages: allPages ? 'all' : 'trim' });
    t.took[doc.method] = t.since(ocrStart);
    if (isPdf) {
      const mode = doc.method === 'tesseract' ? (allPages ? 'all' : 'trim') : 'text';
      meta.pdfPages = { mode, method: doc.method, ...doc.pages };
    }
  } catch (e) {
    console.warn('[read] FAILED:', e.message);
  }
  const ocr = doc?.text || '';
  if (!ocr) {
    t.log('failed');
    return { data: normalise(null), source: 'failed', duplicate: false, ...meta };
  }
  const withText = { ...meta, ocrText: ocr };

  // 2. Regex for the header fields (on a single-spaced copy)
  const regex = parseOcr(ocr.replace(/[ \t]+/g, ' '));
  if (DEBUG_OCR) console.log('[regex]', regex);

  // 3. Line items straight from the pdftotext table — no AI. Trusted when the rows add up to the
  //    bill's Sub Total (or there's no Sub Total and every row has an amount).
  const table = doc.layout ? parseLineItems(doc.layout) : null;
  const tableOk =
    Boolean(table?.items.length) && (table.matchesSubtotal || (table.subtotal == null && table.items.every((it) => it.amount > 0)));
  if (table) {
    withText.lineItems = { method: 'table', rows: table.items.length, sum: table.sum, subtotal: table.subtotal, matchesSubtotal: table.matchesSubtotal, used: tableOk };
  }

  // Everything found without AI (clean text PDF) → done, no AI call
  if (tableOk && regex.gstin && regex.invoice_no && regex.total) {
    const data = normalise({ ...regex, vendor_name: guessVendorName(ocr), line_items: table.items });
    t.log('pdftotext table — no AI');
    return finish(data, 'pdftotext', withText, { cacheKey, ns });
  }

  // 4. AI race (fills what the text / regex couldn't), with few-shot examples of earlier approved invoices
  let examples = '';
  if (fewShot) {
    try {
      examples = await fewShot(regex, ocr);
    } catch (e) {
      console.warn('[extract] fewShot failed:', e.message);
    }
  }
  const aiErrors = {};
  const answer = await raceProviders(activeProviders(), { ocrText: ocr, regexFields: regex, examples }, judge, t.took, aiErrors);
  t.log(answer?.source || 'regex');

  let data;
  let source;
  if (answer) {
    data = normalise(fillGaps(answer.data, regex));
    source = answer.source;
  } else {
    data = normalise(regex);
    source = isUseful(data) ? 'regex' : 'failed';
    withText.aiErrors = aiErrors; // tell the user why the AI didn't help
  }
  // The parsed table beats the AI's reading of it
  if (tableOk) data.line_items = normalise({ line_items: table.items }).line_items;
  if (source === 'failed') return { data, source, duplicate: false, ...withText };
  return finish(data, source, withText, { cacheKey, ns });
}

// The seller's name as printed at the top (first line that isn't a document title)
function guessVendorName(text) {
  return (
    text
      .split('\n')
      .map((l) => l.trim().split(/\s{2,}/)[0])
      .find((l) => l && l.length > 3 && !/^(tax\s+)?invoice|^bill|^original|^duplicate|^page\b|gstin/i.test(l))
      ?.replace(/\s+(tax\s+)?invoice\b.*$/i, '')
      .trim() || ''
  );
}

// Cache a good result (and spot the same bill uploaded as a different file)
async function finish(data, source, withText, { cacheKey, ns }) {
  // Don't cache empty or regex-only results, so re-uploading can still reach the AI
  if (!USE_CACHE || !isUseful(data) || source === 'regex') {
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
