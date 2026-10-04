// POST /bills/extract — store the uploaded file and read the invoice with OCR + AI
import fs from 'fs';
import { extractWithMeta } from '../services/extraction/index.js';
import { saveFile } from '../services/files.service.js';
import * as learn from '../services/learning/index.js';
import { httpError } from '../utils/httpError.js';

const removeTemp = (file) => fs.rm(file.path, { force: true }, () => {});

export async function extractBill(req, res) {
  if (!req.file) throw httpError(400, 'PDF or image file required');
  const orgId = req.user.financeOrgId;

  // Store in GridFS while extraction runs — no extra wait for the upload
  const saving = saveFile(req.file.path, req.file.originalname, req.file.mimetype);
  // Few-shot: earlier approved invoices like this one (same vendor GSTIN or similar text)
  const fewShot = async (regex, ocrText) =>
    learn.buildFewShotBlock(await learn.getExamples(orgId, { gstins: [regex?.gstin, ...(regex?.gstins || [])], ocrText }));
  // pages: 'trim' (first 2 + last 2, default) | 'all' — PDF only
  const pages = req.body.pages === 'all' ? 'all' : 'trim';
  const extracting = extractWithMeta(req.file.path, req.file.mimetype, { pages, fewShot });
  extracting.catch(() => {}); // awaited below; avoid an unhandled rejection if saving fails first

  let pdfFile;
  try {
    pdfFile = await saving;
  } catch (e) {
    await extracting.catch(() => {}); // let extraction finish with the temp file before deleting it
    removeTemp(req.file);
    throw httpError(500, 'Could not store file: ' + e.message);
  }

  try {
    const { data, source, pdfPages, ocrText } = await extracting;
    // Vendor memory: fields users keep correcting the same way
    const hints = await learn.getVendorHints(orgId, {
      gstins: [data?.gstin, ...(data?.gstins || [])],
      ocrText,
      aiGstin: data?.gstin,
      aiInvoiceNo: data?.invoice_no,
    });
    // Log the raw AI output (before hints) so corrections keep being counted
    if (orgId) {
      learn.saveExtraction({ financeOrgId: orgId, fileId: pdfFile, ocrText, aiOutput: data, provider: source, vendorGstin: data?.gstin });
    }
    res.json({
      pdfFile,
      fileType: req.file.mimetype,
      extracted: learn.applyVendorHints(data, hints),
      extractMeta: { source, pdfPages, ...(Object.keys(hints).length ? { hints } : {}) },
    });
  } catch (e) {
    res.json({ pdfFile, fileType: req.file.mimetype, extracted: {}, warning: e.message });
  } finally {
    removeTemp(req.file);
  }
}
