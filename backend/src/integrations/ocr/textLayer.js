// A PDF's own (embedded) text, from every page: pdftotext -layout when installed, else pdf.js.
// Returns '' when there's no usable text (scanned / photographed PDFs) — those need OCR.
import { pdfjsText } from './pdfjsText.js';
import { available, pdfToText } from './pdftotext.js';

// A text layer that's mostly single characters is barcode / CMap garbage
function looksLikeGarbage(text) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  if (tokens.length < 30) return true;
  return tokens.filter((t) => t.length === 1).length / tokens.length > 0.4;
}

// → { text, method: 'pdftotext' | 'pdfjs' } or { text: '' }
export async function pdfTextLayer(filePath) {
  if (await available()) {
    try {
      const text = await pdfToText(filePath);
      if (!looksLikeGarbage(text)) return { text, method: 'pdftotext' };
    } catch (e) {
      console.warn('[pdftotext] failed:', e.message);
    }
  }
  try {
    const text = await pdfjsText(filePath);
    if (!looksLikeGarbage(text)) return { text, method: 'pdfjs' };
  } catch (e) {
    console.warn('[pdfjs] failed:', e.message);
  }
  return { text: '' };
}
