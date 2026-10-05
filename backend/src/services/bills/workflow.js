// The approval chain: PM → CM → OM → FM → Zoho
import { usersRepo } from '../../db/index.js';
import { httpError } from '../../utils/httpError.js';
import { MANAGER_ROLE, ROLE_NAME } from '../hierarchy.service.js';
import { postToZoho } from './postToZoho.js';

// Send a bill into the chain from its owner's level:
//   PM → their CM, CM → their OM, OM → their FM, FM → straight to Zoho
export async function startChain(b, owner, slabOverrides) {
  if (owner.role === 'FM') return postToZoho(b, slabOverrides);
  const want = MANAGER_ROLE[owner.role];
  const approver = owner.managerId && (await usersRepo.findById(owner.managerId));
  if (!approver || approver.role !== want) {
    throw httpError(400, `You don't have a ${ROLE_NAME[want]} assigned — ask the Admin to set who you report to`);
  }
  Object.assign(b, { status: 'PENDING', stage: approver.role, approverId: approver.id, firstStage: approver.role });
}

// Approve: at CM/OM → to the current approver's own manager; at FM → posted to Zoho
export async function approve(b, slabOverrides) {
  if (b.stage === 'FM') return postToZoho(b, slabOverrides);
  const approver = await usersRepo.findById(b.approverId);
  const want = MANAGER_ROLE[b.stage];
  const next = approver?.managerId && (await usersRepo.findById(approver.managerId));
  if (!next || next.role !== want) {
    throw httpError(400, `${approver?.name || 'The approver'} has no ${ROLE_NAME[want]} assigned — ask the Admin to set it`);
  }
  Object.assign(b, { stage: next.role, approverId: next.id });
}

// Reject: back to the owner; `stage` keeps who rejected it
export function reject(b) {
  Object.assign(b, { status: 'REJECTED', approverId: null });
}

// The owner can edit a draft, a rejected bill, or a pending bill nobody has approved yet
export const isEditable = (b) =>
  b.status === 'DRAFT' || b.status === 'REJECTED' || (b.status === 'PENDING' && b.stage === b.firstStage);

// History entry for an action by `user`
export const historyEntry = (user, action, comment = '') => ({
  by: user.name,
  byId: user.id,
  role: user.role,
  action,
  comment,
  at: new Date(),
});
