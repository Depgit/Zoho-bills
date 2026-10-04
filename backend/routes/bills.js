import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Bill, VendorAccountMap, User, FinanceOrg } from '../models.js';
import { auth } from '../mw.js';
import { extractWithMeta } from '../extract.js';
import * as zoho from '../zoho.js';
const r = Router();
const up = multer({
  dest: 'uploads/',
  limits: { fileSize: 10e6 },
  fileFilter: (q, f, cb) => {
    const isAllowed = f.mimetype === 'application/pdf' || f.mimetype.startsWith('image/');
    cb(null, isAllowed);
  }
});
const del = f => f && fs.rm(path.join('uploads', f), { force: true }, () => { });
const FIELDS = ['vendorId', 'vendorName', 'billNumber', 'date', 'dueDate', 'lineItems', 'extracted', 'fileType', 'discount_amount', 'discount_percent', 'location_id', 'source_of_supply'];
const pick = b => Object.fromEntries(FIELDS.map(k => [k, b[k]]));

r.post('/extract', auth('PM'), up.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF or image file required' });
  try {
    // pages: 'trim' (first 2 + last 2, default) | 'all' — PDF only
    const pages = req.body.pages === 'all' ? 'all' : 'trim';
    const { data, source, pdfPages } = await extractWithMeta(req.file.path, req.file.mimetype, { pages });
    res.json({
      pdfFile: req.file.filename,
      fileType: req.file.mimetype,
      extracted: data,
      extractMeta: { source, pdfPages },
    });
  } catch (e) {
    res.json({
      pdfFile: req.file.filename,
      fileType: req.file.mimetype,
      extracted: {},
      warning: e.message
    });
  }
});

r.post('/', auth('PM'), async (req, res) => {
  const b = req.body;
  if (!/^[a-f0-9]{32}$/.test(b.pdfFile || '') || !fs.existsSync(path.join('uploads', b.pdfFile)))
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
  Object.assign(bill, pick(req.body), { status: 'PENDING_L1', zohoError: null });
  bill.history.push({ by: req.user.name, action: wasRejected ? 'RESUBMITTED' : 'EDITED' });
  res.json(await bill.save());
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
  const q = req.user.role === 'PM'
    ? { createdBy: req.user.id, ...orgFilter }
    : { status: req.query.status || (req.user.role === 'L1' ? 'PENDING_L1' : 'PENDING_FINANCE'), ...orgFilter };
  res.json(await Bill.find(q).populate('createdBy', 'name').sort('-createdAt'));
});

r.get('/:id/pdf', auth(), async (req, res) => {
  const b = await Bill.findById(req.params.id);
  if (!b?.pdfFile || (req.user.role === 'PM' && String(b.createdBy) !== req.user.id)) return res.sendStatus(404);
  const filePath = path.resolve('uploads', b.pdfFile);
  if (!fs.existsSync(filePath)) return res.sendStatus(404);
  res.type(b.fileType || 'application/pdf').sendFile(filePath);
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
    if (req.body.lineItems && Array.isArray(req.body.lineItems)) {
      req.body.lineItems.forEach((updated, i) => {
        if (b.lineItems[i] && updated.tax_id) {
          b.lineItems[i].tax_id = updated.tax_id;
        }
      });
      b.markModified('lineItems');
    }
    const missingTax = b.lineItems.some(l => !l.tax_id);
    if (missingTax) {
      return res.status(400).json({ error: 'Please select a Tax Slab for all line items before approving' });
    }
    // Load the Finance Org to use the correct Zoho credentials
    const org = await FinanceOrg.findById(b.financeOrgId);
    if (!org) return res.status(500).json({ error: 'Finance Org not found for this bill' });
    try {
      b.zohoBillId = await zoho.createBill(org, b);
      try {                                   // attach PDF/image, then delete local copy
        await zoho.attach(org, b.zohoBillId, path.resolve('uploads', b.pdfFile), b.fileType);
        del(b.pdfFile); b.pdfFile = null;
      } catch (e) { b.zohoError = 'Bill created; attachment failed: ' + e.message; }
    } catch (e) {
      return res.status(502).json({ error: 'Zoho: ' + (e.response?.data?.message || e.message) });
    }
  }
  b.status = approve ? s.ok : s.no;
  b.history.push({ by: req.user.name, action: approve ? 'APPROVED' : 'REJECTED', comment: req.body.comment });
  // Clean up uploaded file on final rejection (both levels) or after failed attach
  if (!approve && b.pdfFile) {
    del(b.pdfFile); b.pdfFile = null;
  }
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
