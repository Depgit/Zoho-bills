// Extraction learning log and extraction cache
import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';
import { financeOrgs } from './financeOrgs.js';

// One row per extraction: what the AI read vs what was finally submitted (services/learning)
export const extractionLogs = pgTable(
  'extraction_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    financeOrgId: uuid('finance_org_id')
      .notNull()
      .references(() => financeOrgs.id, { onDelete: 'cascade' }),
    fileId: text('file_id').notNull(), // = bills.file_id at extraction time
    vendorGstin: text('vendor_gstin').notNull().default(''),
    provider: text('provider').notNull().default(''),
    ocrText: text('ocr_text').notNull().default(''),
    aiOutput: jsonb('ai_output'),
    finalOutput: jsonb('final_output'), // set when the bill is submitted
    corrections: jsonb('corrections').notNull().default({}), // { field: { from, to } }
    hasCorrections: boolean('has_corrections').notNull().default(false),
    submitted: boolean('submitted').notNull().default(false), // unsubmitted rows are deleted after 30 days
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('extraction_logs_org_file_unique').on(t.financeOrgId, t.fileId),
    index('extraction_logs_org_submitted_idx').on(t.financeOrgId, t.submitted, t.createdAt),
  ],
);

// Extraction results by file hash (+ by "GSTIN|INVOICE_NO" to spot re-scans of the same bill)
export const extractionCache = pgTable(
  'extraction_cache',
  {
    hash: text('hash').primaryKey(),
    invoiceKey: text('invoice_key'),
    data: jsonb('data').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('extraction_cache_invoice_idx').on(t.invoiceKey, t.createdAt)],
);
