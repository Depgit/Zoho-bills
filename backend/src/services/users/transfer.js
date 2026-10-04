// Move a CM/OM/FM's whole workload to another user of the same role:
// bills waiting on their approval, the people reporting to them, and bills they own.
import { Bill, User } from '../../models/index.js';

export async function transferWorkload(fromId, toId) {
  const [approvals, reports, bills] = await Promise.all([
    Bill.updateMany({ approverId: fromId, status: 'PENDING' }, { $set: { approverId: toId } }),
    User.updateMany({ managerId: fromId }, { $set: { managerId: toId } }),
    Bill.updateMany({ ownerId: fromId }, { $set: { ownerId: toId } }),
  ]);
  return { approvals: approvals.modifiedCount, reports: reports.modifiedCount, bills: bills.modifiedCount };
}

// A user got a new manager: their own bills waiting on the old manager follow to the new one
export async function followNewManager(userId, oldManagerId, newManagerId) {
  if (!oldManagerId || !newManagerId || String(oldManagerId) === String(newManagerId)) return 0;
  const res = await Bill.updateMany(
    { ownerId: userId, status: 'PENDING', approverId: oldManagerId },
    { $set: { approverId: newManagerId } },
  );
  return res.modifiedCount;
}
