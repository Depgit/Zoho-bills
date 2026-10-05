// PDF pages handed to OCR: first N + last N pages (header/vendor + totals), or the whole file
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

export async function trimPdf(filePath, firstN = 2, lastN = 2) {
  const raw = fs.readFileSync(filePath);
  try {
    const doc = await PDFDocument.load(raw, { ignoreEncryption: true });
    const total = doc.getPageCount();
    if (total <= firstN + lastN) return { bytes: raw, total, kept: total };

    const pages = [
      ...new Set([
        ...Array.from({ length: firstN }, (_, i) => i),
        ...Array.from({ length: lastN }, (_, i) => total - lastN + i),
      ]),
    ];
    const out = await PDFDocument.create();
    (await out.copyPages(doc, pages)).forEach((p) => out.addPage(p));
    return { bytes: Buffer.from(await out.save()), total, kept: pages.length };
  } catch (e) {
    console.warn('[trimPdf] failed, sending full PDF:', e.message);
    return { bytes: raw };
  }
}

export async function wholePdf(filePath) {
  const raw = fs.readFileSync(filePath);
  const total = await PDFDocument.load(raw, { ignoreEncryption: true })
    .then((d) => d.getPageCount())
    .catch(() => undefined);
  return { bytes: raw, total, kept: total };
}
