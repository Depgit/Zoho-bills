// Bills: list, totals, create (draft or submit), edit, delete, file, approve / reject
import { usersRepo } from '../../db/index.js';
import * as bills from '../../services/bills/index.js';
import { assignablePms, teamBelow } from '../../services/hierarchy.service.js';
import { presentBill, presentBills } from '../presenters/bill.js';

// GET /bills?scope=queue|history|mine&…filters → { rows, total, page, pageSize, summary }
export async function listBills(req, res) {
  const page = await bills.listBills(req.user, req.query);
  res.json({ ...page, rows: presentBills(page.rows) });
}

// GET /bills/properties?…filters → per-property totals
export const propertyTotals = async (req, res) => res.json(await bills.propertyTotals(req.user, req.query));

// GET /bills/expenses?…filters → per expense account totals
export const expenseTotals = async (req, res) => res.json(await bills.expenseTotals(req.user, req.query));

// PMs the logged-in uploader can assign a bill to (PM: just themselves)
export async function listAssignablePms(req, res) {
  const me = await usersRepo.findById(req.user.id);
  res.json((await assignablePms(me)).map((u) => ({ id: u.id, name: u.name, location_name: u.location_name })));
}

// Users below me (with managerId), for the OM / CM filters
export const listTeam = async (req, res) => res.json(await teamBelow(req.user));

export const createBill = async (req, res) => res.json(presentBill(await bills.createBill(req.user, req.body)));

export const updateBill = async (req, res) => res.json(presentBill(await bills.updateBill(req.user, req.params.id, req.body)));

export async function deleteBill(req, res) {
  await bills.deleteBill(req.user, req.params.id);
  res.json({ ok: true });
}

export async function billFile(req, res) {
  const file = await bills.billFile(req.user, req.params.id);
  if (!file) return res.sendStatus(404);
  res.type(file.type);
  file.stream.on('error', () => res.end()).pipe(res);
}

// POST /bills/approve-many { ids, comment? } → { results: [{ id, billNumber, ok, status, stage, error }] }
export const approveMany = async (req, res) => res.json({ results: await bills.approveMany(req.user, req.body.ids, (req.body.comment || '').trim()) });

export const decide = async (req, res) =>
  res.json(presentBill(await bills.decide(req.user, req.params.id, req.params.act, req.body)));
