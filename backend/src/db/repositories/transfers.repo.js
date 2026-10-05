// Move a user's whole workload to another user in one transaction:
// pending approvals, the people reporting to them, and the bills they own
import { and, eq } from 'drizzle-orm';
import { db } from '../client.js';
import { bills, users } from '../schema/index.js';

export function transferWorkload(fromId, toId) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const approvals = await tx
      .update(bills)
      .set({ approverId: toId, updatedAt: now })
      .where(and(eq(bills.approverId, fromId), eq(bills.status, 'PENDING')))
      .returning({ id: bills.id });
    const reports = await tx.update(users).set({ managerId: toId }).where(eq(users.managerId, fromId)).returning({ id: users.id });
    const owned = await tx.update(bills).set({ ownerId: toId, updatedAt: now }).where(eq(bills.ownerId, fromId)).returning({ id: bills.id });
    return { approvals: approvals.length, reports: reports.length, bills: owned.length };
  });
}
