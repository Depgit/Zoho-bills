// Which bills a user may see:
//   ADMIN → every bill in the org
//   PM → bills assigned to them (incl. drafts) + bills they own
//   CM/OM/FM → bills assigned to any PM below them, bills they own, waiting on them, or acted on
import { pmIdsBelow } from '../hierarchy.service.js';

export async function visibleQuery(user) {
  if (user.role === 'ADMIN') return {};
  const me = user.id;
  if (user.role === 'PM') return { $or: [{ 'allocations.pmId': me }, { ownerId: me }] };
  const pms = await pmIdsBelow(user);
  return { $or: [{ 'allocations.pmId': { $in: pms } }, { ownerId: me }, { approverId: me }, { 'history.byId': me }] };
}

// GET /bills?scope=  queue (waiting on me; Admin: all pending) | history (all I can see) | mine (I own)
export async function scopeQuery(user, scope = 'queue') {
  if (scope === 'mine') return { ownerId: user.id };
  if (scope === 'history') return visibleQuery(user);
  return user.role === 'ADMIN' ? { status: 'PENDING' } : { status: 'PENDING', approverId: user.id };
}
