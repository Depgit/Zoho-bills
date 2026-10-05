// Writing bills: save (row + line items + allocations + new history, all in one transaction),
// delete, and bulk moves used by user transfers
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../client.js';
import { billAllocations, billHistory, billLineItems, bills } from '../../schema/index.js';
import { findById } from './read.js';
import { toAllocationRows, toBillRow, toHistoryRow, toLineRows } from './mapper.js';

// Insert (no id) or update a bill; history entries without an id are appended. Returns the saved bill.
export async function save(bill) {
  const id = await db.transaction(async (tx) => {
    const row = toBillRow(bill);
    let billId = bill.id;
    if (billId) await tx.update(bills).set({ ...row, updatedAt: new Date() }).where(eq(bills.id, billId));
    else [{ id: billId }] = await tx.insert(bills).values(row).returning({ id: bills.id });

    await tx.delete(billLineItems).where(eq(billLineItems.billId, billId));
    await tx.delete(billAllocations).where(eq(billAllocations.billId, billId));
    const lines = toLineRows(billId, bill.lineItems);
    const allocations = toAllocationRows(billId, bill.allocations);
    const newHistory = (bill.history || []).filter((h) => !h.id).map((h) => toHistoryRow(billId, h));
    if (lines.length) await tx.insert(billLineItems).values(lines);
    if (allocations.length) await tx.insert(billAllocations).values(allocations);
    if (newHistory.length) await tx.insert(billHistory).values(newHistory);
    return billId;
  });
  return findById(id);
}

export const remove = (id) => db.delete(bills).where(eq(bills.id, id));

// The owner's pending bills waiting on their old manager move to the new one
export async function moveOwnersPendingApprovals(ownerId, oldApproverId, newApproverId) {
  const rows = await db
    .update(bills)
    .set({ approverId: newApproverId, updatedAt: new Date() })
    .where(and(eq(bills.ownerId, ownerId), eq(bills.status, 'PENDING'), eq(bills.approverId, oldApproverId)))
    .returning({ id: bills.id });
  return rows.length;
}

// Rejected bills that still have a file and were rejected more than `days` ago → [{ id, fileId }]
export const rejectedWithFileOlderThan = (days) =>
  db
    .select({ id: bills.id, fileId: bills.fileId })
    .from(bills)
    .where(
      and(
        eq(bills.status, 'REJECTED'),
        isNotNull(bills.fileId),
        sql`(select max(${billHistory.at}) from ${billHistory} where ${billHistory.billId} = ${bills.id} and ${billHistory.action} = 'REJECTED')
            < now() - make_interval(days => ${days})`,
      ),
    );

// The bill no longer has its file; the note goes into its history (one transaction)
export function detachFile(id, entry) {
  return db.transaction(async (tx) => {
    await tx.update(bills).set({ fileId: null }).where(eq(bills.id, id));
    await tx.insert(billHistory).values(toHistoryRow(id, entry));
  });
}
