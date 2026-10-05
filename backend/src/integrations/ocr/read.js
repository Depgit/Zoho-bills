// Text of an uploaded bill:
//   PDF with a text layer → all pages, read directly (pdftotext -layout, else pdf.js) — fast, exact
//   scanned PDF          → Tesseract on the first 2 + last 2 pages (or every page with scannedPages: 'all')
//   image                → Tesseract
// → { text, method: 'pdftotext' | 'pdfjs' | 'tesseract', pages: { read, total } | undefined,
//     layout: the untouched pdftotext output (exact column positions — for the table parser) }
import { DEBUG_OCR } from '../../config/env.js';
import { ocrImage, ocrPdfPages } from './ocr.js';
import { trimPdf, wholePdf } from './pdf.js';
import { pdfTextLayer } from './textLayer.js';

const MAX_CHARS = 60_000; // keeps very long PDFs inside every AI's context: start + end are kept

// Tidy without losing the column layout: long gaps stay a wide gap, pages become blank lines
function tidy(text) {
  let t = String(text || '')
    .replace(/\f/g, '\n\n')
    .replace(/[|]/g, ' ')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((l) => l.replace(/ {4,}/g, '   ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.length > MAX_CHARS) t = `${t.slice(0, MAX_CHARS * 0.6)}\n\n[… middle pages left out …]\n\n${t.slice(-MAX_CHARS * 0.4)}`;
  return t;
}

export async function readDocument(filePath, mimeType, { scannedPages = 'trim' } = {}) {
  let result;
  if (mimeType?.startsWith('image/')) {
    result = { text: await ocrImage(filePath), method: 'tesseract' };
  } else {
    const layer = await pdfTextLayer(filePath);
    if (layer.text) {
      const { total } = await wholePdf(filePath);
      result = { text: layer.text, method: layer.method, pages: { read: total, total }, ...(layer.method === 'pdftotext' ? { layout: layer.text } : {}) };
    } else {
      const chosen = scannedPages === 'all' ? await wholePdf(filePath) : await trimPdf(filePath, 2, 2);
      result = { text: await ocrPdfPages(chosen.bytes), method: 'tesseract', pages: { read: chosen.kept, total: chosen.total } };
    }
  }
  result.text = tidy(result.text);
  if (DEBUG_OCR) console.log(`=== ${result.method} ===\n${result.text}`);
  return result;
}
