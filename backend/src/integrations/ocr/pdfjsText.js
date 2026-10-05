// A PDF's text with pdf.js (no system program needed). Text pieces are put back into rows by
// their position on the page, with a wide gap where columns are apart — close to pdftotext -layout.
import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROW_TOLERANCE = 3; // points: pieces this close vertically are on the same row
const COLUMN_GAP = 8; // points: a horizontal gap wider than this separates columns

function pageText(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [, , , , x, y] = it.transform;
    let row = rows.find((r) => Math.abs(r.y - y) <= ROW_TOLERANCE);
    if (!row) rows.push((row = { y, pieces: [] }));
    row.pieces.push({ x, end: x + (it.width || 0), str: it.str });
  }
  return rows
    .sort((a, b) => b.y - a.y) // top of the page first
    .map((r) => {
      let line = '';
      let prevEnd = null;
      for (const p of r.pieces.sort((a, b) => a.x - b.x)) {
        if (prevEnd !== null) line += p.x - prevEnd > COLUMN_GAP ? '   ' : p.x - prevEnd > 0.5 ? ' ' : '';
        line += p.str;
        prevEnd = p.end;
      }
      return line;
    })
    .join('\n');
}

// All pages of a PDF file as text ("\f" between pages)
export async function pdfjsText(filePath) {
  const task = getDocument({ data: new Uint8Array(fs.readFileSync(filePath)), verbosity: 0, isEvalSupported: false });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      pages.push(pageText((await page.getTextContent()).items));
      page.cleanup();
    }
    return pages.join('\f');
  } finally {
    await task.destroy();
  }
}
