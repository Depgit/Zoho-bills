// Extraction learning log: what the AI read, and what was finally submitted
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { isUuid } from '../ids.js';
import { extractionLogs } from '../schema/index.js';

// Insert or refresh the log for one uploaded file
export const upsertExtraction = ({ financeOrgId, fileId, ocrText, aiOutput, provider, vendorGstin }) =>
  db
    .insert(extractionLogs)
    .values({ financeOrgId, fileId, ocrText, aiOutput, provider, vendorGstin })
    .onConflictDoUpdate({
      target: [extractionLogs.financeOrgId, extractionLogs.fileId],
      set: { ocrText, aiOutput, provider, vendorGstin },
    });

export const findByFile = async (financeOrgId, fileId) =>
  isUuid(financeOrgId)
    ? (
        await db
          .select()
          .from(extractionLogs)
          .where(and(eq(extractionLogs.financeOrgId, financeOrgId), eq(extractionLogs.fileId, String(fileId))))
          .limit(1)
      )[0] || null
    : null;

export const update = (id, patch) => db.update(extractionLogs).set(patch).where(eq(extractionLogs.id, id));

// The most recent submitted logs of an org
export const recentSubmitted = (financeOrgId, limit) =>
  isUuid(financeOrgId)
    ? db
        .select()
        .from(extractionLogs)
        .where(and(eq(extractionLogs.financeOrgId, financeOrgId), eq(extractionLogs.submitted, true)))
        .orderBy(desc(extractionLogs.createdAt))
        .limit(limit)
    : [];

// GSTINs that submitted bills were corrected away from at least `minSeen` times
export async function correctedAwayGstins(financeOrgId, minSeen) {
  if (!isUuid(financeOrgId)) return [];
  const from = sql`${extractionLogs.corrections} -> 'gstin' ->> 'from'`;
  const rows = await db
    .select({ gstin: from })
    .from(extractionLogs)
    .where(and(eq(extractionLogs.financeOrgId, financeOrgId), eq(extractionLogs.submitted, true), sql`coalesce(${from}, '') <> ''`))
    .groupBy(from)
    .having(sql`count(*) >= ${minSeen}`);
  return rows.map((r) => r.gstin);
}

// Delete extractions never submitted within `days`
export const deleteUnsubmittedOlderThan = (days) =>
  db
    .delete(extractionLogs)
    .where(and(eq(extractionLogs.submitted, false), lt(extractionLogs.createdAt, new Date(Date.now() - days * 864e5))));
