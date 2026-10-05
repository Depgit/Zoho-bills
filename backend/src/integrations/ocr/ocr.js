// Tesseract OCR for images and for scanned PDFs (pages rendered to images first)
import { pdf as pdfToImg } from 'pdf-to-img';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

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

export async function ocrImage(input) {
  const worker = await getWorker();
  return (await worker.recognize(await preprocess(input))).data.text;
}

// Every page of these PDF bytes, rendered and OCR'd
export async function ocrPdfPages(bytes) {
  let out = '';
  for await (const page of await pdfToImg(bytes, { scale: 2 })) out += `${await ocrImage(page)}\n`;
  return out;
}
