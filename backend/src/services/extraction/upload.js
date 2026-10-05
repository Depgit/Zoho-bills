// An uploaded bill file: store it and read it with OCR + AI (with what we learned from earlier bills)
import fs from 'fs';
import { httpError } from '../../utils/httpError.js';
import { saveFile } from '../files.service.js';
import * as learn from '../learning/index.js';
import { extractWithMeta } from './index.js';

const removeTemp = (file) => fs.rm(file.path, { force: true }, () => {});

// file = multer upload { path, originalname, mimetype }; pages: 'trim' (first 2 + last 2) | 'all'
export async function extractUpload(orgId, file, pages) {
  if (!file) throw httpError(400, 'PDF or image file required');

  // Store the file while extraction runs — no extra wait for the upload
  const saving = saveFile(file.path, file.originalname, file.mimetype);
  // Few-shot: earlier approved invoices like this one (same vendor GSTIN or similar text)
  const fewShot = async (regex, ocrText) =>
    learn.buildFewShotBlock(await learn.getExamples(orgId, { gstins: [regex?.gstin, ...(regex?.gstins || [])], ocrText }));
  const extracting = extractWithMeta(file.path, file.mimetype, { pages: pages === 'all' ? 'all' : 'trim', fewShot });
  extracting.catch(() => {}); // awaited below; avoid an unhandled rejection if saving fails first

  let pdfFile;
  try {
    pdfFile = await saving;
  } catch (e) {
    await extracting.catch(() => {}); // let extraction finish with the temp file before deleting it
    removeTemp(file);
    throw httpError(500, 'Could not store file: ' + e.message);
  }

  try {
    const { data, source, pdfPages, ocrText, lineItems, aiErrors } = await extracting;
    // Vendor memory: fields users keep correcting the same way
    const hints = await learn.getVendorHints(orgId, {
      gstins: [data?.gstin, ...(data?.gstins || [])],
      ocrText,
      aiGstin: data?.gstin,
      aiInvoiceNo: data?.invoice_no,
    });
    // Log the raw AI output (before hints) so corrections keep being counted
    if (orgId) learn.saveExtraction({ financeOrgId: orgId, fileId: pdfFile, ocrText, aiOutput: data, provider: source, vendorGstin: data?.gstin });
    return {
      pdfFile,
      fileType: file.mimetype,
      extracted: learn.applyVendorHints(data, hints),
      extractMeta: { source, pdfPages, lineItems, aiErrors, ...(Object.keys(hints).length ? { hints } : {}) },
    };
  } catch (e) {
    return { pdfFile, fileType: file.mimetype, extracted: {}, warning: e.message };
  } finally {
    removeTemp(file);
  }
}
