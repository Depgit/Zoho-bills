import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { Bill, VendorAccountMap, User, FinanceOrg, Contact } from '../models.js';
import { auth } from '../mw.js';
import { extractWithMeta } from '../extract.js';
import * as zoho from '../zoho.js';
import { taxPlan } from '../gst.js';
import { saveFile, fileExists, streamFile, readFile, deleteFile } from '../files.js';
import * as learn from '../learn.js';
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
const FIELDS = ['vendorId', 'vendorName', 'billNumber', 'date', 'dueDate', 'lineItems', 'extracted', 'fileType', 'discount_amount', 'discount_percent', 'location_id', 'source_of_supply'];
const pick = b => Object.fromEntries(FIELDS.map(k => [k, b[k]]));

// Vendor GSTIN for learning: Zoho contact first, else what was extracted
const vendorGstinOf = async (financeOrgId, bill) =>
  (await Contact.findOne({ financeOrgId, contact_id: bill.vendorId }, 'gst_no').lean())?.gst_no || bill.extracted?.gstin || '';

// Record what the PM finally submitted vs what the AI read (learn.js) — never blocks the response
const learnFinal = (financeOrgId, bill) => vendorGstinOf(financeOrgId, bill)
  .then(vendorGstin => learn.recordFinal({ financeOrgId, fileId: String(bill.pdfFile), bill, vendorGstin }))
  .catch(e => console.error('[learn] final', e.message));

r.post('/extract', auth('PM'), up.single('file'), async (req, res) => {
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
});

r.post('/', auth('PM'), async (req, res) => {
  const b = req.body;
  if (!(await fileExists(b.pdfFile)))
    return res.status(400).json({ error: 'Invalid upload' });
  if (!b.vendorId || !b.billNumber || !b.date || !b.lineItems?.length ||
    b.lineItems.some(l => !l.account_id || !(l.rate > 0) || !(l.quantity > 0)))
    return res.status(400).json({ error: 'Fill vendor, bill no, dates, and account/tax/rate(>0)/qty for every line' });
  if (await Bill.exists({ vendorId: b.vendorId, billNumber: b.billNumber, status: { $nin: ['REJECTED_L1', 'REJECTED_FINANCE'] } }))
    return res.status(409).json({ error: 'Bill number already exists for this vendor' });
  // Stamp location and source_of_supply from the PM's profile
  const pmUser = await User.findById(req.user.id);
  if (!pmUser?.financeOrgId) return res.status(403).json({ error: 'Your account is not linked to a Finance Org' });
  const bill = await Bill.create({
    ...pick(b),
    pdfFile: b.pdfFile,
    fileType: b.fileType || 'application/pdf',
    createdBy: req.user.id,
    financeOrgId: pmUser.financeOrgId,
    location_id: pmUser?.location_id || '',
    source_of_supply: pmUser?.source_of_supply || '',
    history: [{ by: req.user.name, action: 'SUBMITTED' }]
  });
  learnFinal(bill.financeOrgId, bill);
  res.json(bill);
});

// PM edits a PENDING_L1 or rejected bill (same fields, keeps/resets status)
r.put('/:id', auth('PM'), async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill || String(bill.createdBy) !== req.user.id)
    return res.status(403).json({ error: 'Not your bill' });
  if (!['PENDING_L1', 'REJECTED_L1', 'REJECTED_FINANCE'].includes(bill.status))
    return res.status(409).json({ error: 'Bill cannot be edited at this stage' });
  const wasRejected = bill.status.startsWith('REJECTED');
  // PM re-uploaded the bill while editing → swap in the new file
  const newFile = req.body.pdfFile;
  if (newFile && newFile !== bill.pdfFile) {
    if (!(await fileExists(newFile)))
      return res.status(400).json({ error: 'Invalid upload' });
    del(bill.pdfFile);
    bill.pdfFile = newFile;
    bill.fileType = req.body.fileType || 'application/pdf';
  }
  if (!(await fileExists(bill.pdfFile)))
    return res.status(400).json({ error: 'Bill file is missing — please re-upload the bill' });
  Object.assign(bill, pick(req.body), { status: 'PENDING_L1', zohoError: null });
  bill.history.push({ by: req.user.name, action: wasRejected ? 'RESUBMITTED' : 'EDITED' });
  await bill.save();
  learnFinal(bill.financeOrgId, bill);
  res.json(bill);
});

// PM deletes a rejected or pending bill
r.delete('/:id', auth('PM'), async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill || String(bill.createdBy) !== req.user.id)
    return res.status(403).json({ error: 'Not your bill' });
  if (bill.status === 'POSTED')
    return res.status(409).json({ error: 'Posted bills cannot be deleted' });
  if (bill.pdfFile) del(bill.pdfFile);
  await Bill.findByIdAndDelete(req.params.id);
  res.json({ ok: true, message: 'Bill deleted successfully' });
});

r.get('/', auth(), async (req, res) => {
  // All queries scoped to the Finance Org
  const orgFilter = req.user.financeOrgId ? { financeOrgId: req.user.financeOrgId } : {};
  // PM: own bills. L1/Finance: their queue, or ?scope=history → every bill in the org
  const q = req.user.role === 'PM'
    ? { createdBy: req.user.id, ...orgFilter }
    : req.query.scope === 'history'
      ? orgFilter
      : { status: req.query.status || (req.user.role === 'L1' ? 'PENDING_L1' : 'PENDING_FINANCE'), ...orgFilter };
  const list = await Bill.find(q).populate('createdBy', 'name location_name source_of_supply').sort('-createdAt').lean();
  // Vendor GSTIN: Zoho contact first, else what OCR read off the bill
  const contacts = await Contact.find({ ...orgFilter, contact_id: { $in: [...new Set(list.map(b => b.vendorId))] } }, 'contact_id gst_no').lean();
  const gstOf = Object.fromEntries(contacts.map(c => [c.contact_id, c.gst_no]));
  res.json(list.map(b => {
    const vendorGstin = gstOf[b.vendorId] || b.extracted?.gstin || '';
    const { hasGst, vendor, property, interState } = taxPlan({ ...b, vendorGstin }, []);
    return { ...b, vendorGstin, taxInfo: { hasGst, vendor, property, interState } };
  }));
});

r.get('/:id/pdf', auth(), async (req, res) => {
  const b = await Bill.findById(req.params.id);
  if (!b?.pdfFile || (req.user.role === 'PM' && String(b.createdBy) !== req.user.id)) return res.sendStatus(404);
  if (!(await fileExists(b.pdfFile))) return res.sendStatus(404);
  res.type(b.fileType || 'application/pdf');
  streamFile(b.pdfFile).on('error', () => res.end()).pipe(res);
});

const STEP = {
  L1: { from: 'PENDING_L1', ok: 'PENDING_FINANCE', no: 'REJECTED_L1' },
  FINANCE: { from: 'PENDING_FINANCE', ok: 'POSTED', no: 'REJECTED_FINANCE' }
};
r.post('/:id/:act(approve|reject)', auth('L1', 'FINANCE'), async (req, res) => {
  const s = STEP[req.user.role], b = await Bill.findById(req.params.id);
  if (!b || b.status !== s.from) return res.status(409).json({ error: 'Bill is not in your queue' });
  const approve = req.params.act === 'approve';
  if (!approve && !req.body.comment) return res.status(400).json({ error: 'Rejection reason required' });
  if (approve && req.user.role === 'FINANCE') {
    const vendor = await Contact.findOne({ financeOrgId: b.financeOrgId, contact_id: b.vendorId }, 'gst_no').lean();
    b.vendorGstin = vendor?.gst_no || b.extracted?.gstin || '';
    if (req.body.lineItems && Array.isArray(req.body.lineItems)) {
      req.body.lineItems.forEach((updated, i) => {
        if (b.lineItems[i] && updated.tax_id) {
          b.lineItems[i].tax_id = updated.tax_id;
        }
      });
      b.markModified('lineItems');
    }
    // Load the Finance Org to use the correct Zoho credentials
    const org = await FinanceOrg.findById(b.financeOrgId);
    if (!org) return res.status(500).json({ error: 'Finance Org not found for this bill' });
    // Slab is automatic: vendor GSTIN state vs PM's property state → GST / IGST.
    // No vendor GSTIN → no GST, so no slab on any line.
    const plan = taxPlan(b, await zoho.taxes(org).catch(() => []));
    b.lineItems.forEach(l => { l.tax_id = plan.needsSlab(l) ? (l.tax_id || plan.slabFor(l)) : ''; });
    b.markModified('lineItems');
    if (b.lineItems.some(l => plan.needsSlab(l) && !l.tax_id)) {
      return res.status(400).json({ error: 'Could not pick the tax slab automatically (vendor/property state unknown or no matching slab in Zoho) — please select it' });
    }
    try {
      b.zohoBillId = await zoho.createBill(org, b);
      try {                                   // attach PDF/image, then delete local copy
        await zoho.attach(org, b.zohoBillId, await readFile(b.pdfFile), b.fileType);
        del(b.pdfFile); b.pdfFile = null;
      } catch (e) { b.zohoError = 'Bill created; attachment failed: ' + e.message; }
    } catch (e) {
      return res.status(502).json({ error: 'Zoho: ' + (e.response?.data?.message || e.message) });
    }
  }
  b.status = approve ? s.ok : s.no;
  b.history.push({ by: req.user.name, action: approve ? 'APPROVED' : 'REJECTED', comment: req.body.comment });
  // Keep the file on rejection — PM can edit & resubmit. It's removed when the PM deletes the bill.
  res.json(await b.save());
});
// ── Vendor → Default Expense Account memory ──
r.get('/vendor-account-map', auth('PM'), async (req, res) => {
  const maps = await VendorAccountMap.find({ userId: req.user.id });
  const result = {};
  maps.forEach(m => { result[m.vendorId] = m.account_id; });
  res.json(result);
});

r.post('/vendor-account-map', auth('PM'), async (req, res) => {
  const { vendorId, account_id } = req.body;
  if (!vendorId || !account_id) return res.status(400).json({ error: 'vendorId and account_id required' });
  await VendorAccountMap.findOneAndUpdate(
    { userId: req.user.id, vendorId },
    { account_id },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
});

export default r;
