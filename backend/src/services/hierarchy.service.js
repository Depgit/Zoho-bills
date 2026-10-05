// Roles and reporting lines.
//
//   ADMIN (exactly one per org) — creates users, sets roles/reporting, transfers workloads
//   FM  Finance Manager      ── final approver; approval pushes the bill to Zoho
//    └─ OM  Operations Manager
//        └─ CM  Cluster Manager
//            └─ PM  Property Manager
//
// Every user except FM/ADMIN has a `managerId` pointing at a user of the role above.
import { usersRepo } from '../db/index.js';

export const STAFF_ROLES = ['PM', 'CM', 'OM', 'FM']; // roles the Admin can assign
export const MANAGER_ROLE = { PM: 'CM', CM: 'OM', OM: 'FM', FM: null };
export const UPLOAD_ROLES = ['PM', 'CM', 'OM', 'FM'];
export const APPROVER_ROLES = ['CM', 'OM', 'FM'];
export const TRANSFER_ROLES = ['CM', 'OM', 'FM'];
export const ROLE_NAME = {
  PM: 'Property Manager',
  CM: 'Cluster Manager',
  OM: 'Operations Manager',
  FM: 'Finance Manager',
  ADMIN: 'Admin',
};

// PMs a user may assign bill amounts to: PM → only themselves; CM/OM/FM → every PM below them
export const assignablePms = (user) => (user.role === 'PM' ? [user] : usersRepo.below(user.id, 'PM'));

// Ids of every PM below a user
export const pmIdsBelow = async (userId) => (await usersRepo.below(userId, 'PM')).map((u) => u.id);

// Everyone below a user (Admin: the whole org), for the history team filters
export async function teamBelow(user) {
  const team = user.role === 'ADMIN' ? await usersRepo.staffOfOrg(user.financeOrgId) : await usersRepo.below(user.id);
  return team.map(({ id, name, role, managerId, location_name }) => ({ id, name, role, managerId, location_name }));
}
