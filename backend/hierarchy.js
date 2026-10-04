// Roles and reporting lines.
//
//   ADMIN (exactly one per org) — creates users, sets roles/reporting, transfers workloads
//   FM  Finance Manager      ── final approver; approval pushes the bill to Zoho
//    └─ OM  Operations Manager
//        └─ CM  Cluster Manager
//            └─ PM  Property Manager
//
// Every user except FM/ADMIN has a `managerId` pointing at a user of the role above.
// A bill waits on one specific approver (`approverId`); approving passes it to that
// approver's own manager. FM approval → Zoho.
import { User } from './models.js';

export const ROLES = ['PM', 'CM', 'OM', 'FM', 'ADMIN'];
export const STAFF_ROLES = ['PM', 'CM', 'OM', 'FM'];          // roles the Admin can assign
export const MANAGER_ROLE = { PM: 'CM', CM: 'OM', OM: 'FM', FM: null };
export const UPLOAD_ROLES = ['PM', 'CM', 'OM', 'FM'];
export const TRANSFER_ROLES = ['CM', 'OM', 'FM'];
export const ROLE_NAME = { PM: 'Property Manager', CM: 'Cluster Manager', OM: 'Operations Manager', FM: 'Finance Manager', ADMIN: 'Admin' };

export const orgUsers = (financeOrgId) =>
  User.find({ financeOrgId }, 'name role managerId location_id location_name source_of_supply').lean();

// All user ids below `rootId` (direct and indirect reports), from a preloaded user list
export function below(users, rootId) {
  const kids = new Map();
  for (const u of users) {
    const m = String(u.managerId || '');
    if (!kids.has(m)) kids.set(m, []);
    kids.get(m).push(u);
  }
  const out = [];
  const stack = [String(rootId)];
  while (stack.length) {
    for (const u of kids.get(stack.pop()) || []) {
      out.push(u);
      stack.push(String(u._id));
    }
  }
  return out;
}

// PMs a user may assign bill amounts to: PM → only themselves; CM/OM/FM → every PM below them
export async function assignablePms(user) {
  if (user.role === 'PM') return [user];
  const users = await orgUsers(user.financeOrgId);
  return below(users, user._id || user.id).filter(u => u.role === 'PM');
}
