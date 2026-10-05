// Extraction cache (kept in the database, so it survives deploys):
//   by file hash         → extracted data
//   by "GSTIN|INVOICE_NO" → the first result for that bill (same bill re-scanned as a different file)
// Cache problems never break an extraction.
import fs from 'fs';
import crypto from 'crypto';
import { extractionCacheRepo } from '../../db/index.js';

const safe = (fn, fallback) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    console.warn('[extract] cache:', e.message);
    return fallback;
  }
};

export const cache = {
  getByHash: safe(extractionCacheRepo.getByHash, null),
  getByInvoice: safe(extractionCacheRepo.getByInvoice, null),
  save: safe(extractionCacheRepo.save, undefined),
};

export const fileHash = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

export function invoiceKey(d) {
  if (!d?.gstin || !d?.invoice_no) return null;
  return `${d.gstin}|${String(d.invoice_no).toUpperCase().replace(/\s+/g, '')}`;
}
