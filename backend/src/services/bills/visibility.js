// Which bills a user may see, as search criteria (src/db turns these into SQL):
//   ADMIN → every bill in the org
//   PM → bills assigned to them (incl. drafts) + bills they own
//   CM/OM/FM → bills assigned to any PM below them, bills they own, waiting on them, or acted on
import { pmIdsBelow } from '../hierarchy.service.js';

export async function visibleTo(user) {
  if (user.role === 'ADMIN') return null; // everything in the org
  if (user.role === 'PM') return { pmIds: [user.id], ownerId: user.id };
  return { pmIds: await pmIdsBelow(user.id), ownerId: user.id, approverId: user.id, actedById: user.id };
}

// Base criteria per list scope:
//   queue   → pending bills waiting on me (Admin: every pending bill)
//   history → everything I can see
//   mine    → bills I own
export async function scopeCriteria(user, scope) {
  const base = { financeOrgId: user.financeOrgId };
  if (scope === 'mine') return { ...base, ownerId: user.id };
  if (scope === 'history') return { ...base, visibleTo: await visibleTo(user) };
  return { ...base, statuses: ['PENDING'], ...(user.role === 'ADMIN' ? {} : { approverId: user.id }) };
}
