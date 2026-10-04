// Tesseract OCR: all text from an image or PDF.
// PDFs use their embedded text layer when it's usable, else pages are rendered and OCR'd.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { pdf as pdfToImg } from 'pdf-to-img';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { DEBUG_OCR } from './config.js';
import { trimPdf } from './pdf.js';

let workerPromise;
const getWorker = () =>
  (workerPromise ??= (async () => {
    const w = await Tesseract.createWorker('eng');
    await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    return w;
  })());

// Grayscale, upscale, normalise contrast → much better OCR on phone photos
const preprocess = (input) =>
  sharp(input).rotate().grayscale().resize({ width: 2400 }).normalise().sharpen().png().toBuffer();

async function ocrImage(input) {
  const worker = await getWorker();
  return (await worker.recognize(await preprocess(input))).data.text;
}

// A text layer that's mostly single characters is barcode/CMap garbage
function looksLikeGarbage(text) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  if (tokens.length < 30) return true;
  return tokens.filter((t) => t.length === 1).length / tokens.length > 0.4;
}

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

// `pdfPages` = { bytes } from pdf.js, to OCR only the chosen pages
export async function ocrText(file, mimeType, pdfPages) {
  const text = mimeType?.startsWith('image/')
    ? await ocrImage(file)
    : await ocrPdf((pdfPages ?? (await trimPdf(file, 2, 2))).bytes);
  const cleaned = String(text || '')
    .replace(/[|]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (DEBUG_OCR) console.log('=== OCR ===\n' + cleaned);
  return cleaned;
}
