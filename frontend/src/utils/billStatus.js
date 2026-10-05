// "Draft", "Pending CM · Ravi", "Rejected by OM", "Posted to Zoho"
export function statusText(b) {
  if (!b) return '';
  if (b.status === 'DRAFT') return 'Draft';
  if (b.status === 'PENDING') return `Pending ${b.stage}${b.approver?.name ? ` · ${b.approver.name}` : ''}`;
  if (b.status === 'REJECTED') return `Rejected by ${b.stage}`;
  if (b.status === 'POSTED') return 'Posted to Zoho';
  return b.status;
}

// The owner can still edit: a draft, a rejected bill, or a pending bill nobody has approved yet
export const isEditable = (b) =>
  Boolean(b) && (b.status === 'DRAFT' || b.status === 'REJECTED' || (b.status === 'PENDING' && b.stage === b.firstStage));

export const isOwner = (b, userId) => Boolean(b?.ownerId) && b.ownerId === String(userId);

// Who must fix a rejected bill: always its owner (the uploader), never the PMs it is assigned to
export const returnedTo = (b) => (b?.owner?.name ? `${b.owner.name} (${b.owner.role})` : 'the uploader');

// Approval trail of the current round: e.g. [CM ✓ Ravi, OM ✕ Priya]
export function approvalTrail(b) {
  const history = b.history || [];
  const actions = history.map((x) => x.action);
  const start = Math.max(actions.lastIndexOf('SUBMITTED'), actions.lastIndexOf('RESUBMITTED'), 0);
  return history.slice(start).filter((x) => ['APPROVED', 'REJECTED', 'POSTED'].includes(x.action));
}

const person = (p) => (p?.name ? `${p.name} (${p.role})` : '');
const EDITS = ['DRAFT_SAVED', 'SUBMITTED', 'RESUBMITTED'];

// Who uploaded the bill: "Ravi (CM)"
export const uploadedBy = (b) => person(b?.creator) || person(b?.owner) || '—';

// The last save / submit, if someone other than the uploader made it (or it was edited after upload):
// → { who: "Priya (OM)", at } or null
export function lastEdit(b) {
  const edits = (b?.history || []).filter((h) => EDITS.includes(h.action));
  if (edits.length < 2 && edits[0]?.byId === b?.createdBy) return null;
  const last = edits.at(-1);
  return last ? { who: `${last.by}${last.role ? ` (${last.role})` : ''}`, at: last.at } : null;
}
