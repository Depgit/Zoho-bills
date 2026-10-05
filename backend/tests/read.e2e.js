// Reading bills: text PDFs in full (pdftotext / pdf.js), scanned PDFs + photos through Tesseract.
//   npm run test:read   (no database needed)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

const { readDocument } = await import('../src/integrations/ocr/index.js');
const { available } = await import('../src/integrations/ocr/pdftotext.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zb-read-'));
let fails = 0;
const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};

// 6-page text PDF; one detail only on page 4 (the old first 2 + last 2 rule skipped it)
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let p = 1; p <= 6; p++) {
  const page = doc.addPage([595, 842]);
  page.drawText(`TAX INVOICE page ${p}  Invoice No: AKE/24-25/118  GSTIN 07ABKCS9857K1ZE`, { x: 40, y: 800, size: 10, font });
  const rows = p === 4 ? [['Cement 50kg bags', '10', '350.00', '3500.00'], ['PAGE-FOUR-ONLY steel rods', '2', '1200.00', '2400.00']] : [['Sand', '1', '100.00', '100.00']];
  rows.forEach((r, i) => [40, 300, 380, 470].forEach((x, j) => page.drawText(r[j], { x, y: 700 - i * 18, size: 10, font })));
  for (let k = 0; k < 8; k++) page.drawText(`terms and conditions line ${k} for page ${p} goods once sold`, { x: 40, y: 400 - k * 14, size: 9, font });
}
const textPdf = path.join(dir, 'text.pdf');
fs.writeFileSync(textPdf, await doc.save());

// Image-only ("scanned") 6-page PDF
const scan = await PDFDocument.create();
for (let p = 1; p <= 6; p++) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="400"><rect width="100%" height="100%" fill="white"/><text x="40" y="140" font-size="64" font-family="Arial">TAX INVOICE PAGE ${p}</text></svg>`;
  const img = await scan.embedPng(await sharp(Buffer.from(svg)).png().toBuffer());
  scan.addPage([620, 200]).drawImage(img, { x: 0, y: 0, width: 620, height: 200 });
}
const scanPdf = path.join(dir, 'scan.pdf');
fs.writeFileSync(scanPdf, await scan.save());

const hasPoppler = await available();
let r = await readDocument(textPdf, 'application/pdf');
ok(`text PDF read directly (${r.method})`, r.method === (hasPoppler ? 'pdftotext' : 'pdfjs'));
ok('text PDF: all 6 pages read', r.pages?.read === 6 && r.pages?.total === 6 && r.text.includes('PAGE-FOUR-ONLY'));
ok(`${r.method} keeps a table row on one line`, /Cement 50kg bags\s+10\s+350\.00\s+3500\.00/.test(r.text));

const pages = (t) => [...new Set((t.match(/PAGE \d/g) || []).map((m) => m.slice(-1)))].sort().join('');
r = await readDocument(scanPdf, 'application/pdf');
ok('scanned PDF → Tesseract on first 2 + last 2', r.method === 'tesseract' && r.pages.read === 4 && pages(r.text) === '1256');
r = await readDocument(scanPdf, 'application/pdf', { scannedPages: 'all' });
ok('scanned PDF, all pages → Tesseract on 6', r.method === 'tesseract' && r.pages.read === 6 && pages(r.text) === '123456');

// Table parser (no AI): rows from pdftotext layout text, checked against the Sub Total
const { parseLineItems } = await import('../src/services/extraction/tableParser.js');
const layout = [
  '                                   Property    Property',
  '   #  Item & Description            Name        Code      Qty      Rate    Discount       Amount',
  '',
  '   1  Channel Manager-21 to 30      Saltstay    37398       1   18,000.      65.00%     6,300.00',
  '      (Quarterly Subscription)      z Grand                          00',
  '      SAC: 997331                   Sky',
  '',
  '   2  PMS-API Lite Plan             Saltstay    37398       1   2,625.0        0.00     2,625.00',
  '                                                                     0',
  '\f                              Property   Property',
  '#  Item & Description             Name       Code     Qty     Rate   Discount    Amount',
  '3  Point Of Sale                  Saltstay   61228      2   9,000.0     65.00%   6,300.00',
  '                                                               0',
  '                                                        Sub Total            15,225.00',
  '                                                     IGST18 (18%)             2,740.50',
].join('\n');
const table = parseLineItems(layout);
ok('table parser: every row across pages', table.items.length === 3);
ok('table parser: rows add up to the Sub Total', table.matchesSubtotal && table.sum === 15225);
ok('table parser: wrapped numbers + discount → net rate', table.items[0].rate === 6300 && table.items[2].quantity === 2 && table.items[2].rate === 3150);
ok('table parser: HSN/SAC and property columns', table.items[0].hsn === '997331' && /Saltstay z Grand Sky/.test(table.items[0].description));

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
