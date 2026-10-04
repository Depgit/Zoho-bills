import { idOf } from './ids.js';

// "Draft", "Pending CM · Ravi", "Rejected by OM", "Posted to Zoho"
export function statusText(b) {
  if (!b) return '';
  if (b.status === 'DRAFT') return 'Draft';
  if (b.status === 'PENDING') return `Pending ${b.stage}${b.approverId?.name ? ` · ${b.approverId.name}` : ''}`;
  if (b.status === 'REJECTED') return `Rejected by ${b.stage}`;
  if (b.status === 'POSTED') return 'Posted to Zoho';
  return b.status;
}

// The owner can still edit: a draft, a rejected bill, or a pending bill nobody has approved yet
export const isEditable = (b) =>
  Boolean(b) && (b.status === 'DRAFT' || b.status === 'REJECTED' || (b.status === 'PENDING' && b.stage === b.firstStage));

export const isOwner = (b, userId) => idOf(b?.ownerId) === String(userId);

// Who must fix a rejected bill: always its owner (the uploader), never the PMs it is assigned to
export const returnedTo = (b) => (b?.ownerId?.name ? `${b.ownerId.name} (${b.ownerId.role})` : 'the uploader');

// Approval trail of the current round: e.g. [CM ✓ Ravi, OM ✕ Priya]
export function approvalTrail(b) {
  const history = b.history || [];
  const actions = history.map((x) => x.action);
  const start = Math.max(actions.lastIndexOf('SUBMITTED'), actions.lastIndexOf('RESUBMITTED'), 0);
  return history.slice(start).filter((x) => ['APPROVED', 'REJECTED', 'POSTED'].includes(x.action));
}
