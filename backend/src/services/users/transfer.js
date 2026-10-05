// Moving work between users
import { billsRepo, transfersRepo } from '../../db/index.js';

// A CM/OM/FM's whole workload → another user of the same role (one transaction):
// bills waiting on their approval, the people reporting to them, and bills they own
export const transferWorkload = (fromId, toId) => transfersRepo.transferWorkload(fromId, toId);

// A user got a new manager: their own bills waiting on the old manager follow to the new one
export function followNewManager(userId, oldManagerId, newManagerId) {
  if (!oldManagerId || !newManagerId || oldManagerId === newManagerId) return 0;
  return billsRepo.moveOwnersPendingApprovals(userId, oldManagerId, newManagerId);
}
