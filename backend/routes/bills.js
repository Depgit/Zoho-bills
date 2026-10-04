import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { Bill, VendorAccountMap, User, FinanceOrg, Contact } from '../models.js';
import { auth, h, httpError } from '../mw.js';
import { extractWithMeta } from '../extract.js';
import * as zoho from '../zoho.js';
import { taxPlan } from '../gst.js';
import { saveFile, fileExists, streamFile, readFile, deleteFile } from '../files.js';
import * as learn from '../learn.js';
import { UPLOAD_ROLES, MANAGER_ROLE, ROLE_NAME, assignablePms, orgUsers, below } from '../hierarchy.js';
const r = Router();
const up = multer({
  dest: os.tmpdir(),                    // temp only — moved into GridFS after extraction
  limits: { fileSize: 10e6 },
  fileFilter: (q, f, cb) => {
    const isAllowed = f.mimetype === 'application/pdf' || f.mimetype.startsWith('image/');
    cb(null, isAllowed);
  }
});
const del = deleteFile;
// location_id / source_of_supply / allocations are never copied from the body as-is
const FIELDS = ['vendorId', 'vendorName', 'billNumber', 'date', 'dueDate', 'lineItems', 'extracted', 'fileType', 'discount_amount', 'discount_percent'];
const pick = b => Object.fromEntries(FIELDS.filter(k => k in b).map(k => [k, b[k]]));
const sameId = (a, b) => a && b && String(a._id || a) === String(b._id || b);

// Bill total as shown in the form: subtotal + tax − discount (discount is taken after tax)
const billTotal = b => {
  const items = b.lineItems || [];
  const sub = items.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 1), 0);
  const tax = items.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 1) * (Number(l.tax_percentage) || 0) / 100, 0);
  const disc = Number(b.discount_amount) > 0 ? Number(b.discount_amount) : sub * (Number(b.discount_percent) || 0) / 100;
  return Math.round((sub + tax - disc) * 100) / 100;
};

// Which PM(s) the bill belongs to.
//   PM owner → always just themselves, for the full total.
//   CM/OM/FM owner → must pick PMs below them; amounts must add up to the total when submitting.
async function resolveAllocations(owner, wanted, total, submitting) {
  if (owner.role === 'PM') return [{ pmId: owner._id, amount: total }];
  const list = (Array.isArray(wanted) ? wanted : []).filter(a => a && a.pmId);
  if (submitting && !list.length) throw httpError(400, 'Choose which Property Manager(s) this bill belongs to');
  const ids = list.map(a => String(a.pmId));
  if (new Set(ids).size !== ids.length) throw httpError(400, 'Each Property Manager can appear only once');
  const allowed = new Set((await assignablePms(owner)).map(u => String(u._id)));
  if (ids.some(id => !allowed.has(id))) throw httpError(400, 'You can only assign bills to Property Managers in your reporting line');
  if (list.some(a => !(Number(a.amount) > 0))) throw httpError(400, 'Every Property Manager needs an amount greater than 0');
  const sum = list.reduce((s, a) => s + Number(a.amount), 0);
  if (submitting && Math.abs(sum - total) > 1)
    throw httpError(400, `Assigned amounts add up to ₹${sum.toFixed(2)} but the bill total is ₹${total.toFixed(2)}`);
  return list.map(a => ({ pmId: a.pmId, amount: Math.round(Number(a.amount) * 100) / 100 }));
}

// Bill location: picked on the form (any active Zoho location), default the owner's profile location.
// Its state (source_of_supply) decides GST vs IGST.
async function resolveLocation(owner, wantedLocationId) {
  const id = wantedLocationId || owner.location_id;
  if (!id) throw httpError(400, 'Select the location this bill is for');
  if (id === owner.location_id && owner.source_of_supply)
    return { location_id: id, location_name: owner.location_name, source_of_supply: owner.source_of_supply };
  const org = await FinanceOrg.findById(owner.financeOrgId);
  const loc = (await zoho.locations(org)).find(l => l.location_id === id);
  if (!loc) throw httpError(400, 'Location not found in Zoho');
  if (!loc.state_code) throw httpError(400, `Location "${loc.location_name}" has no state in Zoho`);
  return { location_id: id, location_name: loc.location_name, source_of_supply: loc.state_code };
}

// Full checks before a bill enters the approval chain
async function checkSubmittable(b) {
  if (!(await fileExists(b.pdfFile))) throw httpError(400, 'The bill file is missing — please upload it again');
  if (!b.vendorId || !b.billNumber || !b.date) throw httpError(400, 'Fill in vendor, bill number and date');
  if (!b.lineItems?.length || b.lineItems.some(l => !l.account_id || !(l.rate > 0) || !(l.quantity > 0)))
    throw httpError(400, 'Every line needs an account, a rate above 0 and a quantity above 0');
  if (await Bill.exists({ _id: { $ne: b._id }, financeOrgId: b.financeOrgId, vendorId: b.vendorId, billNumber: b.billNumber, status: { $in: ['PENDING', 'POSTED'] } }))
    throw httpError(409, `Bill number ${b.billNumber} already exists for this vendor`);
}

// Push a bill to Zoho (FM approval, or an FM's own upload). Tax slab is automatic:
// vendor GSTIN state vs bill location state → GST / IGST; Finance can override per line.
async function postToZoho(b, slabOverrides) {
  const vendor = await Contact.findOne({ financeOrgId: b.financeOrgId, contact_id: b.vendorId }, 'gst_no').lean();
  b.vendorGstin = vendor?.gst_no || b.extracted?.gstin || '';
  (Array.isArray(slabOverrides) ? slabOverrides : []).forEach((u, i) => { if (b.lineItems[i] && u?.tax_id) b.lineItems[i].tax_id = u.tax_id; });
  const org = await FinanceOrg.findById(b.financeOrgId);
  if (!org) throw httpError(500, 'Organisation not found for this bill');
  const plan = taxPlan(b, await zoho.taxes(org).catch(() => []));
  b.lineItems.forEach(l => { l.tax_id = plan.needsSlab(l) ? (l.tax_id || plan.slabFor(l)) : ''; });
  b.markModified('lineItems');
  if (b.lineItems.some(l => plan.needsSlab(l) && !l.tax_id))
    throw httpError(400, 'Could not pick the tax slab automatically (vendor or location state unknown, or no matching slab in Zoho) — please select it');
  try {
    b.zohoBillId = await zoho.createBill(org, b);
  } catch (e) {
    throw httpError(502, 'Zoho: ' + (e.response?.data?.message || e.message));
  }
  try {                                   // attach PDF/image, then delete our copy
    await zoho.attach(org, b.zohoBillId, await readFile(b.pdfFile), b.fileType);
    del(b.pdfFile); b.pdfFile = null;
  } catch (e) { b.zohoError = 'Bill created; attachment failed: ' + e.message; }
  b.status = 'POSTED'; b.stage = ''; b.approverId = null;
}

// Send a bill into the approval chain from its owner's level:
//   PM → their CM, CM → their OM, OM → their FM, FM → straight to Zoho.
async function startChain(b, owner, slabOverrides) {
  if (owner.role === 'FM') return postToZoho(b, slabOverrides);
  const approver = owner.managerId && await User.findById(owner.managerId);
  const want = MANAGER_ROLE[owner.role];
  if (!approver || approver.role !== want)
    throw httpError(400, `You don't have a ${ROLE_NAME[want]} assigned — ask the Admin to set who you report to`);
  Object.assign(b, { status: 'PENDING', stage: approver.role, approverId: approver._id, firstStage: approver.role });
}

const entry = (user, action, comment) => ({ by: user.name, byId: user.id, role: user.role, action, comment });

// Owner can edit a draft, a rejected bill, or a pending bill nobody has approved yet
const editable = b => b.status === 'DRAFT' || b.status === 'REJECTED' || (b.status === 'PENDING' && b.stage === b.firstStage);

// Vendor GSTIN for learning: Zoho contact first, else what was extracted
const vendorGstinOf = async (financeOrgId, bill) =>
  (await Contact.findOne({ financeOrgId, contact_id: bill.vendorId }, 'gst_no').lean())?.gst_no || bill.extracted?.gstin || '';

// Record what was finally submitted vs what the AI read (learn.js) — never blocks the response
const learnFinal = (financeOrgId, bill) => vendorGstinOf(financeOrgId, bill)
  .then(vendorGstin => learn.recordFinal({ financeOrgId, fileId: String(bill.pdfFile), bill, vendorGstin }))
  .catch(e => console.error('[learn] final', e.message));

r.post('/extract', auth(...UPLOAD_ROLES), up.single('file'), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF or image file required' });
  // Store in GridFS while extraction runs — no extra wait for the upload
  const saving = saveFile(req.file.path, req.file.originalname, req.file.mimetype);
  // pages: 'trim' (first 2 + last 2, default) | 'all' — PDF only
  const pages = req.body.pages === 'all' ? 'all' : 'trim';
  const orgId = req.user.financeOrgId;
  // Few-shot: earlier approved invoices like this one (same vendor GSTIN or similar text) go into the AI prompt
  const fewShot = async (regex, ocrText) =>
    learn.buildFewShotBlock(await learn.getExamples(orgId, { gstins: [regex?.gstin, ...(regex?.gstins || [])], ocrText }));
  const extracting = extractWithMeta(req.file.path, req.file.mimetype, { pages, fewShot });
  extracting.catch(() => { });          // awaited below; avoid unhandled rejection if save fails first
  let pdfFile;
  try {
    pdfFile = await saving;
  } catch (e) {
    await extracting.catch(() => { });  // let extraction finish with the temp file before deleting it
    fs.rm(req.file.path, { force: true }, () => { });
    return res.status(500).json({ error: 'Could not store file: ' + e.message });
  }
  try {
    const { data, source, pdfPages, ocrText } = await extracting;
    // Vendor memory: fields PMs keep correcting the same way for this vendor
    const hints = await learn.getVendorHints(orgId, { gstins: [data?.gstin, ...(data?.gstins || [])], ocrText, aiGstin: data?.gstin, aiInvoiceNo: data?.invoice_no });
    const extracted = learn.applyVendorHints(data, hints);
    // Log the raw AI output (before hints) so corrections keep being counted
    if (orgId) learn.saveExtraction({ financeOrgId: orgId, fileId: pdfFile, ocrText, aiOutput: data, provider: source, vendorGstin: data?.gstin });
    res.json({
      pdfFile,
      fileType: req.file.mimetype,
      extracted,
      extractMeta: { source, pdfPages, ...(Object.keys(hints).length ? { hints } : {}) },
    });
  } catch (e) {
    res.json({
      pdfFile,
      fileType: req.file.mimetype,
      extracted: {},
      warning: e.message
    });
  } finally {
    fs.rm(req.file.path, { force: true }, () => { });
  }
}));

// PMs the logged-in uploader can assign a bill to (PM: just themselves)
r.get('/assignable-pms', auth(...UPLOAD_ROLES), h(async (req, res) => {
  const me = await User.findById(req.user.id).lean();
  res.json((await assignablePms(me)).map(u => ({ _id: u._id, name: u.name, location_name: u.location_name })));
}));

// Apply the form to a bill and either keep it as a DRAFT or submit it into the chain.
// body.draft = true → save only (PMs already see their assigned amount, marked Draft)
async function saveBill(b, body, owner, user) {
  Object.assign(b, pick(body));
  Object.assign(b, await resolveLocation(owner, body.location_id || b.location_id));
  const submitting = !body.draft;
  b.allocations = await resolveAllocations(owner, body.allocations, billTotal(b), submitting);
  b.zohoError = null;
  if (!submitting) {
    Object.assign(b, { status: 'DRAFT', stage: '', approverId: null });
    return;
  }
  await checkSubmittable(b);
  await startChain(b, owner, body.lineItems);
}

// ── Upload a new bill (draft or submit) ─────────────────────────────────────
r.post('/', auth(...UPLOAD_ROLES), h(async (req, res) => {
  const body = req.body;
  if (!(await fileExists(body.pdfFile))) throw httpError(400, 'Upload the bill file first');
  const owner = await User.findById(req.user.id);
  if (!owner?.financeOrgId) throw httpError(403, 'Your account is not linked to an organisation');
  const b = new Bill({ pdfFile: body.pdfFile, fileType: body.fileType || 'application/pdf', createdBy: owner._id, ownerId: owner._id, financeOrgId: owner.financeOrgId, history: [] });
  await saveBill(b, body, owner, req.user);
  b.history.push(entry(req.user, body.draft ? 'DRAFT_SAVED' : b.status === 'POSTED' ? 'POSTED' : 'SUBMITTED'));
  await b.save();
  if (!body.draft) learnFinal(b.financeOrgId, b);
  res.json(b);
}));

// ── Edit (and optionally resubmit) a bill the user owns ─────────────────────
r.put('/:id', auth(...UPLOAD_ROLES), h(async (req, res) => {
  const b = await Bill.findById(req.params.id);
  if (!b || !sameId(b.ownerId, req.user.id)) throw httpError(403, 'Only the bill owner can edit it');
  if (!editable(b)) throw httpError(409, 'This bill is already being approved and can no longer be edited');
  const wasRejected = b.status === 'REJECTED';
  const body = req.body;
  // Owner re-uploaded the file while editing → swap it in
  if (body.pdfFile && body.pdfFile !== b.pdfFile) {
    if (!(await fileExists(body.pdfFile))) throw httpError(400, 'Upload the bill file first');
    del(b.pdfFile);
    b.pdfFile = body.pdfFile;
    b.fileType = body.fileType || 'application/pdf';
  }
  const owner = await User.findById(req.user.id);
  await saveBill(b, body, owner, req.user);
  b.history.push(entry(req.user, body.draft ? 'DRAFT_SAVED' : b.status === 'POSTED' ? 'POSTED' : wasRejected ? 'RESUBMITTED' : 'SUBMITTED'));
  await b.save();
  if (!body.draft) learnFinal(b.financeOrgId, b);
  res.json(b);
}));

// ── Delete a bill that isn't posted (owner or Admin) ────────────────────────
r.delete('/:id', auth(), h(async (req, res) => {
  const b = await Bill.findById(req.params.id);
  const admin = req.user.role === 'ADMIN' && b && sameId(b.financeOrgId, req.user.financeOrgId);
  if (!b || !(admin || sameId(b.ownerId, req.user.id))) throw httpError(403, 'Only the bill owner or the Admin can delete it');
  if (b.status === 'POSTED') throw httpError(409, 'Bills already posted to Zoho cannot be deleted');
  if (b.pdfFile) del(b.pdfFile);
  await b.deleteOne();
  res.json({ ok: true });
}));

// What a user may see:
//   ADMIN → every bill in the org
//   PM → bills assigned to them (incl. drafts) + bills they own
//   CM/OM/FM → bills assigned to any PM below them, bills they own, bills waiting on them
async function visibleQuery(user) {
  if (user.role === 'ADMIN') return {};
  const me = user.id;
  if (user.role === 'PM') return { $or: [{ 'allocations.pmId': me }, { ownerId: me }] };
  const pms = below(await orgUsers(user.financeOrgId), me).filter(u => u.role === 'PM').map(u => u._id);
  return { $or: [{ 'allocations.pmId': { $in: pms } }, { ownerId: me }, { approverId: me }, { 'history.byId': me }] };
}

// GET /bills?scope=queue (waiting on me; Admin: all pending) | history (all I can see) | mine (I own)
r.get('/', auth(), h(async (req, res) => {
  const me = req.user.id, scope = req.query.scope || 'queue';
  const org = { financeOrgId: req.user.financeOrgId };
  const q = scope === 'mine' ? { ownerId: me }
    : scope === 'history' ? await visibleQuery(req.user)
      : req.user.role === 'ADMIN' ? { status: 'PENDING' } : { status: 'PENDING', approverId: me };
  const list = await Bill.find({ ...q, ...org })
    .populate('createdBy', 'name role')
    .populate('ownerId', 'name role')
    .populate('approverId', 'name role')
    .populate('allocations.pmId', 'name location_name source_of_supply')
    .sort('-updatedAt').lean();
  // Vendor GSTIN: Zoho contact first, else what OCR read off the bill
  const contacts = await Contact.find({ ...org, contact_id: { $in: [...new Set(list.map(b => b.vendorId).filter(Boolean))] } }, 'contact_id gst_no').lean();
  const gstOf = Object.fromEntries(contacts.map(c => [c.contact_id, c.gst_no]));
  res.json(list.map(b => {
    const vendorGstin = gstOf[b.vendorId] || b.extracted?.gstin || '';
    const { hasGst, vendor, property, interState } = taxPlan({ ...b, vendorGstin }, []);
    return { ...b, vendorGstin, taxInfo: { hasGst, vendor, property, interState } };
  }));
}));

r.get('/:id/pdf', auth(), h(async (req, res) => {
  const b = await Bill.findOne({ _id: req.params.id, financeOrgId: req.user.financeOrgId, ...(await visibleQuery(req.user)) }, 'pdfFile fileType');
  if (!b?.pdfFile || !(await fileExists(b.pdfFile))) return res.sendStatus(404);
  res.type(b.fileType || 'application/pdf');
  streamFile(b.pdfFile).on('error', () => res.end()).pipe(res);
}));

// ── Approve / reject. Approver = the user the bill waits on (or the Admin, acting for them).
//   approve at CM/OM → passes to that approver's own manager; at FM → posted to Zoho
//   reject → back to the owner (REJECTED), who edits and resubmits from the start
r.post('/:id/:act(approve|reject)', auth('CM', 'OM', 'FM', 'ADMIN'), h(async (req, res) => {
  const b = await Bill.findById(req.params.id);
  const mine = b && b.status === 'PENDING' && sameId(b.financeOrgId, req.user.financeOrgId)
    && (req.user.role === 'ADMIN' || sameId(b.approverId, req.user.id));
  if (!mine) throw httpError(409, 'This bill is not waiting on you');
  const approve = req.params.act === 'approve';
  const comment = (req.body.comment || '').trim();
  if (!approve && !comment) throw httpError(400, 'Write a reason for rejecting');
  const actor = req.user.role === 'ADMIN' ? { ...req.user, name: `${req.user.name} (Admin, for ${b.stage})` } : req.user;

  if (!approve) {
    Object.assign(b, { status: 'REJECTED', approverId: null });   // stage stays = who rejected
  } else if (b.stage === 'FM') {
    await postToZoho(b, req.body.lineItems);
  } else {
    const approver = await User.findById(b.approverId);
    const next = approver?.managerId && await User.findById(approver.managerId);
    const want = MANAGER_ROLE[b.stage];
    if (!next || next.role !== want)
      throw httpError(400, `${approver?.name || 'The approver'} has no ${ROLE_NAME[want]} assigned — ask the Admin to set it`);
    Object.assign(b, { stage: next.role, approverId: next._id });
  }
  b.history.push(entry(actor, approve ? (b.status === 'POSTED' ? 'POSTED' : 'APPROVED') : 'REJECTED', comment));
  res.json(await b.save());
}));
// ── Vendor → Default Expense Account memory ──
r.get('/vendor-account-map', auth(...UPLOAD_ROLES), h(async (req, res) => {
  const maps = await VendorAccountMap.find({ userId: req.user.id });
  const result = {};
  maps.forEach(m => { result[m.vendorId] = m.account_id; });
  res.json(result);
}));

r.post('/vendor-account-map', auth(...UPLOAD_ROLES), h(async (req, res) => {
  const { vendorId, account_id } = req.body;
  if (!vendorId || !account_id) return res.status(400).json({ error: 'vendorId and account_id required' });
  await VendorAccountMap.findOneAndUpdate(
    { userId: req.user.id, vendorId },
    { account_id },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
}));

export default r;
