// What users do with a bill: create, edit, delete, open its file, approve / reject
import { billsRepo, usersRepo } from '../../db/index.js';
import { httpError } from '../../utils/httpError.js';
import { deleteFile, fileExists, streamFile } from '../files.service.js';
import { learnFromSubmit } from './learning.js';
import { saveBill } from './save.js';
import { visibleTo } from './visibility.js';
import { approve, historyEntry, isEditable, reject } from './workflow.js';

// History action for a save: draft, posted (FM upload), resubmitted or submitted
const saveAction = (b, draft, wasRejected) =>
  draft ? 'DRAFT_SAVED' : b.status === 'POSTED' ? 'POSTED' : wasRejected ? 'RESUBMITTED' : 'SUBMITTED';

const afterSave = (b, draft) => {
  if (!draft) learnFromSubmit(b);
  return b;
};

export async function createBill(user, body) {
  if (!(await fileExists(body.pdfFile))) throw httpError(400, 'Upload the bill file first');
  const owner = await usersRepo.findById(user.id);
  if (!owner?.financeOrgId) throw httpError(403, 'Your account is not linked to an organisation');

  const b = {
    pdfFile: body.pdfFile,
    fileType: body.fileType || 'application/pdf',
    createdBy: owner.id,
    ownerId: owner.id,
    financeOrgId: owner.financeOrgId,
    lineItems: [],
    allocations: [],
    history: [],
  };
  await saveBill(b, body, owner);
  b.history.push(historyEntry(user, saveAction(b, body.draft, false)));
  return afterSave(await billsRepo.save(b), body.draft);
}

export async function updateBill(user, id, body) {
  const b = await billsRepo.findById(id);
  if (!b || b.ownerId !== user.id) throw httpError(403, 'Only the bill owner can edit it');
  if (!isEditable(b)) throw httpError(409, 'This bill is already being approved and can no longer be edited');
  const wasRejected = b.status === 'REJECTED';

  // Owner re-uploaded the file while editing → swap it in
  let oldFile = null;
  if (body.pdfFile && body.pdfFile !== b.pdfFile) {
    if (!(await fileExists(body.pdfFile))) throw httpError(400, 'Upload the bill file first');
    oldFile = b.pdfFile;
    b.pdfFile = body.pdfFile;
    b.fileType = body.fileType || 'application/pdf';
  }

  await saveBill(b, body, await usersRepo.findById(user.id));
  b.history.push(historyEntry(user, saveAction(b, body.draft, wasRejected)));
  const saved = await billsRepo.save(b);
  if (oldFile) deleteFile(oldFile);
  return afterSave(saved, body.draft);
}

// Owner or Admin deletes a bill that isn't posted
export async function deleteBill(user, id) {
  const b = await billsRepo.findById(id);
  const isAdmin = user.role === 'ADMIN' && b?.financeOrgId === user.financeOrgId;
  if (!b || !(isAdmin || b.ownerId === user.id)) throw httpError(403, 'Only the bill owner or the Admin can delete it');
  if (b.status === 'POSTED') throw httpError(409, 'Bills already posted to Zoho cannot be deleted');
  await billsRepo.remove(b.id);
  if (b.pdfFile) await deleteFile(b.pdfFile);
}

// The bill's file, if the user can see the bill → { stream, type } or null
export async function billFile(user, id) {
  const b = await billsRepo.findOne(id, { financeOrgId: user.financeOrgId, visibleTo: await visibleTo(user) });
  if (!b?.pdfFile || !(await fileExists(b.pdfFile))) return null;
  try {
    return { stream: await streamFile(b.pdfFile), type: b.fileType || 'application/pdf' };
  } catch (e) {
    // Recorded but missing from storage (e.g. STORAGE_DRIVER changed without copying files)
    console.warn(`Bill ${b.id}: file ${b.pdfFile} is missing from storage —`, e.message);
    return null;
  }
}

// Approve / reject. Only the approver the bill waits on — or the Admin, acting for them.
export async function decide(user, id, act, body) {
  const b = await billsRepo.findById(id);
  const waitingOnMe =
    b && b.status === 'PENDING' && b.financeOrgId === user.financeOrgId && (user.role === 'ADMIN' || b.approverId === user.id);
  if (!waitingOnMe) throw httpError(409, 'This bill is not waiting on you');

  const approving = act === 'approve';
  const comment = (body.comment || '').trim();
  if (!approving && !comment) throw httpError(400, 'Write a reason for rejecting');
  const actor = user.role === 'ADMIN' ? { ...user, name: `${user.name} (Admin, for ${b.stage})` } : user;

  if (approving) await approve(b, body.lineItems);
  else reject(b);

  const action = !approving ? 'REJECTED' : b.status === 'POSTED' ? 'POSTED' : 'APPROVED';
  b.history.push(historyEntry(actor, action, comment));
  return billsRepo.save(b);
}

const BULK_LIMIT = 100;

// Approve many bills in one go (approvers who already checked them). Each bill is approved on its
// own — one failing (e.g. Zoho rejects it at FM) doesn't stop the others. → [{ id, billNumber, ok, status, stage, error }]
export async function approveMany(user, ids, comment = '') {
  const list = [...new Set(Array.isArray(ids) ? ids : [])];
  if (!list.length) throw httpError(400, 'Pick at least one bill to approve');
  if (list.length > BULK_LIMIT) throw httpError(400, `Approve at most ${BULK_LIMIT} bills at a time`);
  const results = [];
  for (const id of list) {
    try {
      const b = await decide(user, id, 'approve', { comment });
      results.push({ id, billNumber: b.billNumber, ok: true, status: b.status, stage: b.stage });
    } catch (e) {
      const b = await billsRepo.findById(id).catch(() => null);
      results.push({ id, billNumber: b?.billNumber || '', ok: false, error: e.message });
    }
  }
  return results;
}
