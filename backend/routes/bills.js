import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Bill } from '../models.js';
import { auth } from '../mw.js';
import { extract } from '../extract.js';
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
const del = f => f && fs.rm(path.join('uploads', f), { force: true }, () => {});
const FIELDS = ['vendorId', 'vendorName', 'billNumber', 'date', 'dueDate', 'lineItems', 'extracted', 'fileType'];
const pick = b => Object.fromEntries(FIELDS.map(k => [k, b[k]]));

r.post('/extract', auth('PM'), up.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF or image file required' });
  try {
    res.json({
      pdfFile: req.file.filename,
      fileType: req.file.mimetype,
      extracted: await extract(req.file.path, req.file.mimetype)
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
  if (!b.vendorId || !b.billNumber || !b.date || !b.dueDate || !b.lineItems?.length ||
      b.lineItems.some(l => !l.account_id || !l.tax_id || !(l.rate >= 0) || !(l.quantity > 0)))
    return res.status(400).json({ error: 'Fill vendor, bill no, dates, and account/tax/rate/qty for every line' });
  if (await Bill.exists({ vendorId: b.vendorId, billNumber: b.billNumber, status: { $nin: ['REJECTED_L1', 'REJECTED_FINANCE'] } }))
    return res.status(409).json({ error: 'Bill number already exists for this vendor' });
  const bill = await Bill.create({ ...pick(b), pdfFile: b.pdfFile, fileType: b.fileType || 'application/pdf', createdBy: req.user.id,
    history: [{ by: req.user.name, action: 'SUBMITTED' }] });
  res.json(bill);
});

// PM edits and resubmits a rejected bill
r.put('/:id', auth('PM'), async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill || String(bill.createdBy) !== req.user.id || !bill.status.startsWith('REJECTED'))
    return res.status(409).json({ error: 'Cannot resubmit' });
  Object.assign(bill, pick(req.body), { status: 'PENDING_L1', zohoError: null });
  bill.history.push({ by: req.user.name, action: 'RESUBMITTED' });
  res.json(await bill.save());
});

r.get('/', auth(), async (req, res) => {
  const q = req.user.role === 'PM' ? { createdBy: req.user.id }
    : { status: req.query.status || (req.user.role === 'L1' ? 'PENDING_L1' : 'PENDING_FINANCE') };
  res.json(await Bill.find(q).populate('createdBy', 'name').sort('-createdAt'));
});

r.get('/:id/pdf', auth(), async (req, res) => {
  const b = await Bill.findById(req.params.id);
  if (!b?.pdfFile || (req.user.role === 'PM' && String(b.createdBy) !== req.user.id)) return res.sendStatus(404);
  const filePath = path.resolve('uploads', b.pdfFile);
  if (!fs.existsSync(filePath)) return res.sendStatus(404);
  res.type(b.fileType || 'application/pdf').sendFile(filePath);
});

const STEP = { L1: { from: 'PENDING_L1', ok: 'PENDING_FINANCE', no: 'REJECTED_L1' },
  FINANCE: { from: 'PENDING_FINANCE', ok: 'POSTED', no: 'REJECTED_FINANCE' } };
r.post('/:id/:act(approve|reject)', auth('L1', 'FINANCE'), async (req, res) => {
  const s = STEP[req.user.role], b = await Bill.findById(req.params.id);
  if (!b || b.status !== s.from) return res.status(409).json({ error: 'Bill is not in your queue' });
  const approve = req.params.act === 'approve';
  if (!approve && !req.body.comment) return res.status(400).json({ error: 'Rejection reason required' });
  if (approve && req.user.role === 'FINANCE') {
    try {
      b.zohoBillId = await zoho.createBill(b);
      try {                                   // attach PDF/image, then delete local copy
        await zoho.attach(b.zohoBillId, path.resolve('uploads', b.pdfFile), b.fileType);
        del(b.pdfFile); b.pdfFile = null;
      } catch (e) { b.zohoError = 'Bill created; attachment failed: ' + e.message; }
    } catch (e) {
      return res.status(502).json({ error: 'Zoho: ' + (e.response?.data?.message || e.message) });
    }
  }
  b.status = approve ? s.ok : s.no;
  b.history.push({ by: req.user.name, action: approve ? 'APPROVED' : 'REJECTED', comment: req.body.comment });
  res.json(await b.save());
});
export default r;
