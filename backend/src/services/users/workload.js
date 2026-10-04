// Everything still assigned to a user — must be empty before deleting them or changing their role
import { Bill, User } from '../../models/index.js';

const OPEN = { $ne: 'POSTED' }; // a bill that still needs work

export async function workload(user) {
  const [reports, approvals, owned, allocated] = await Promise.all([
    User.countDocuments({ managerId: user._id }),
    Bill.countDocuments({ approverId: user._id, status: 'PENDING' }),
    Bill.countDocuments({ ownerId: user._id, status: OPEN }),
    Bill.countDocuments({ 'allocations.pmId': user._id, status: OPEN }),
  ]);
  return { reports, approvals, owned, allocated };
}

export const hasWork = (w) => Boolean(w.reports || w.approvals || w.owned || w.allocated);

export const describeWork = (w) =>
  [
    w.reports && `${w.reports} people report to them`,
    w.approvals && `${w.approvals} bill(s) wait on their approval`,
    w.owned && `they own ${w.owned} open bill(s)`,
    w.allocated && `${w.allocated} open bill(s) are assigned to them`,
  ]
    .filter(Boolean)
    .join(', ');
