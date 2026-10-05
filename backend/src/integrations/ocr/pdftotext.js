// Poppler's `pdftotext -layout`: the PDF's own text with columns kept in line (best for invoice tables).
// It's a system program (brew install poppler / apt-get install poppler-utils); when it isn't
// installed, available() is false and the caller falls back to pdf.js.
import { execFile } from 'child_process';

const BIN = process.env.PDFTOTEXT_PATH || 'pdftotext';

const run = (args, opts = {}) =>
  new Promise((resolve, reject) =>
    execFile(BIN, args, { maxBuffer: 32 * 1024 * 1024, timeout: 30_000, ...opts }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );

let installed;
export async function available() {
  if (installed === undefined) {
    installed = await run(['-v'])
      .then(() => true)
      .catch((e) => e.code !== 'ENOENT'); // `-v` exits non-zero on some versions but still runs
    if (!installed) console.warn('[pdftotext] not installed — using pdf.js for PDF text (install poppler for better layout)');
  }
  return installed;
}

// All pages of a PDF file as text ("\f" between pages)
export const pdfToText = (filePath) => run(['-layout', '-enc', 'UTF-8', filePath, '-']);
