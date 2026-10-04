// Bills: create (draft or submit), edit, delete, list, file, approve / reject
import { Bill, User } from '../models/index.js';
import { httpError } from '../utils/httpError.js';
import { sameId } from '../utils/ids.js';
import { assignablePms, teamBelow } from '../services/hierarchy.service.js';
import { deleteFile, fileExists, streamFile } from '../services/files.service.js';
import { saveBill } from '../services/bills/save.js';
import { approve, historyEntry, isEditable, reject } from '../services/bills/workflow.js';
import { scopeQuery, visibleQuery } from '../services/bills/visibility.js';
import { withTaxInfo } from '../services/bills/present.js';
import { learnFromSubmit } from '../services/bills/learning.js';

// History action for a save: draft, posted (FM upload), resubmitted or submitted
const saveAction = (b, draft, wasRejected) =>
  draft ? 'DRAFT_SAVED' : b.status === 'POSTED' ? 'POSTED' : wasRejected ? 'RESUBMITTED' : 'SUBMITTED';

// PMs the logged-in uploader can assign a bill to (PM: just themselves)
export async function listAssignablePms(req, res) {
  const me = await User.findById(req.user.id).lean();
  res.json((await assignablePms(me)).map((u) => ({ _id: u._id, name: u.name, location_name: u.location_name })));
}

// GET /bills/team — users below me (with managerId), so history can be filtered by OM / CM
export async function listTeam(req, res) {
  res.json(await teamBelow(req.user));
}

export async function createBill(req, res) {
  const body = req.body;
  if (!(await fileExists(body.pdfFile))) throw httpError(400, 'Upload the bill file first');
  const owner = await User.findById(req.user.id);
  if (!owner?.financeOrgId) throw httpError(403, 'Your account is not linked to an organisation');

  const b = new Bill({
    pdfFile: body.pdfFile,
    fileType: body.fileType || 'application/pdf',
    createdBy: owner._id,
    ownerId: owner._id,
    financeOrgId: owner.financeOrgId,
    history: [],
  });
  await saveBill(b, body, owner);
  b.history.push(historyEntry(req.user, saveAction(b, body.draft, false)));
  await b.save();
  if (!body.draft) learnFromSubmit(b);
  res.json(b);
}

export async function updateBill(req, res) {
  const b = await Bill.findById(req.params.id);
  if (!b || !sameId(b.ownerId, req.user.id)) throw httpError(403, 'Only the bill owner can edit it');
  if (!isEditable(b)) throw httpError(409, 'This bill is already being approved and can no longer be edited');
  const body = req.body;
  const wasRejected = b.status === 'REJECTED';

  // Owner re-uploaded the file while editing → swap it in
  if (body.pdfFile && body.pdfFile !== b.pdfFile) {
    if (!(await fileExists(body.pdfFile))) throw httpError(400, 'Upload the bill file first');
    deleteFile(b.pdfFile);
    b.pdfFile = body.pdfFile;
    b.fileType = body.fileType || 'application/pdf';
  }

  await saveBill(b, body, await User.findById(req.user.id));
  b.history.push(historyEntry(req.user, saveAction(b, body.draft, wasRejected)));
  await b.save();
  if (!body.draft) learnFromSubmit(b);
  res.json(b);
}

// Owner or Admin deletes a bill that isn't posted
export async function deleteBill(req, res) {
  const b = await Bill.findById(req.params.id);
  const isAdmin = req.user.role === 'ADMIN' && b && sameId(b.financeOrgId, req.user.financeOrgId);
  if (!b || !(isAdmin || sameId(b.ownerId, req.user.id))) {
    throw httpError(403, 'Only the bill owner or the Admin can delete it');
  }
  if (b.status === 'POSTED') throw httpError(409, 'Bills already posted to Zoho cannot be deleted');
  if (b.pdfFile) deleteFile(b.pdfFile);
  await b.deleteOne();
  res.json({ ok: true });
}

// GET /bills?scope=queue|history|mine
export async function listBills(req, res) {
  const org = req.user.financeOrgId;
  const bills = await Bill.find({ ...(await scopeQuery(req.user, req.query.scope)), financeOrgId: org })
    .populate('createdBy', 'name role')
    .populate('ownerId', 'name role')
    .populate('approverId', 'name role')
    .populate('allocations.pmId', 'name location_name source_of_supply')
    .sort('-updatedAt')
    .lean();
  res.json(await withTaxInfo(bills, org));
}

export async function billFile(req, res) {
  const b = await Bill.findOne(
    { _id: req.params.id, financeOrgId: req.user.financeOrgId, ...(await visibleQuery(req.user)) },
    'pdfFile fileType',
  );
  if (!b?.pdfFile || !(await fileExists(b.pdfFile))) return res.sendStatus(404);
  res.type(b.fileType || 'application/pdf');
  streamFile(b.pdfFile)
    .on('error', () => res.end())
    .pipe(res);
}

// Approve / reject. Only the approver the bill waits on — or the Admin, acting for them.
export async function decide(req, res) {
  const b = await Bill.findById(req.params.id);
  const waitingOnMe =
    b &&
    b.status === 'PENDING' &&
    sameId(b.financeOrgId, req.user.financeOrgId) &&
    (req.user.role === 'ADMIN' || sameId(b.approverId, req.user.id));
  if (!waitingOnMe) throw httpError(409, 'This bill is not waiting on you');

  const approving = req.params.act === 'approve';
  const comment = (req.body.comment || '').trim();
  if (!approving && !comment) throw httpError(400, 'Write a reason for rejecting');
  const actor = req.user.role === 'ADMIN' ? { ...req.user, name: `${req.user.name} (Admin, for ${b.stage})` } : req.user;

  if (approving) await approve(b, req.body.lineItems);
  else reject(b);

  const action = !approving ? 'REJECTED' : b.status === 'POSTED' ? 'POSTED' : 'APPROVED';
  b.history.push(historyEntry(actor, action, comment));
  res.json(await b.save());
}
