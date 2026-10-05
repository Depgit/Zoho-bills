// Extraction results cached by file hash; also findable by "GSTIN|INVOICE_NO" (re-scans of a bill)
import { asc, eq } from 'drizzle-orm';
import { db } from '../client.js';
import { extractionCache } from '../schema/index.js';

export const getByHash = async (hash) =>
  (await db.select({ data: extractionCache.data }).from(extractionCache).where(eq(extractionCache.hash, hash)).limit(1))[0]?.data || null;

// The first result saved for this invoice → { hash, data }
export const getByInvoice = async (invoiceKey) =>
  (
    await db
      .select({ hash: extractionCache.hash, data: extractionCache.data })
      .from(extractionCache)
      .where(eq(extractionCache.invoiceKey, invoiceKey))
      .orderBy(asc(extractionCache.createdAt))
      .limit(1)
  )[0] || null;

export const save = (hash, invoiceKey, data) =>
  db
    .insert(extractionCache)
    .values({ hash, invoiceKey, data })
    .onConflictDoUpdate({ target: extractionCache.hash, set: { invoiceKey, data } });
