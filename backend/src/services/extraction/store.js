// Extraction cache: a small JSON file.
//   byHash:    sha256(file)        → extracted data
//   byInvoice: "GSTIN|INVOICE_NO"  → { hash, data }  (same bill re-scanned as a different file)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { STORE_FILE } from './config.js';

let data = null;

function load() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    data = { byHash: {}, byInvoice: {} };
  }
  return data;
}

function persist() {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STORE_FILE); // atomic replace, no half-written file
}

export const store = {
  getByHash: (hash) => load().byHash[hash] || null,
  getByInvoice: (key) => load().byInvoice[key] || null,
  save(hash, invoiceKey, value) {
    const d = load();
    d.byHash[hash] = value;
    if (invoiceKey && !d.byInvoice[invoiceKey]) d.byInvoice[invoiceKey] = { hash, data: value };
    persist();
  },
};

export const fileHash = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

export function invoiceKey(d) {
  if (!d?.gstin || !d?.invoice_no) return null;
  return `${d.gstin}|${String(d.invoice_no).toUpperCase().replace(/\s+/g, '')}`;
}
