// Admin-only user management: create users, change role / reporting line / location,
// transfer a manager's whole workload, delete. All scoped to the Admin's org.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Bill, FinanceOrg } from '../models.js';
import { auth, h, httpError } from '../mw.js';
import { STAFF_ROLES, MANAGER_ROLE, TRANSFER_ROLES, ROLE_NAME } from '../hierarchy.js';
import * as zoho from '../zoho.js';
const r = Router();
r.use(auth('ADMIN'));

const OPEN = { $ne: 'POSTED' };   // a bill that still needs work

const findUser = (id, financeOrgId) => User.findOne({ _id: id, financeOrgId });

// Manager must exist in this org and have the role directly above `role` (FM: no manager)
async function checkManager(role, managerId, financeOrgId) {
  const want = MANAGER_ROLE[role];
  if (!want) return null;
  const m = managerId && await findUser(managerId, financeOrgId);
  if (!m || m.role !== want) throw httpError(400, `A ${ROLE_NAME[role]} must report to a ${ROLE_NAME[want]} — pick one`);
  return m._id;
}

// Zoho location → { location_id, location_name, source_of_supply }. Required for PMs.
async function resolveLocation(role, location_id, financeOrgId) {
  if (!location_id) {
    if (role === 'PM') throw httpError(400, 'A Property Manager needs a default location');
    return { location_id: '', location_name: '', source_of_supply: '' };
  }
  const org = await FinanceOrg.findById(financeOrgId);
  const loc = (await zoho.locations(org)).find(l => l.location_id === location_id);
  if (!loc) throw httpError(400, 'Location not found in Zoho');
  if (!loc.state_code) throw httpError(400, `Location "${loc.location_name}" has no state in Zoho — add its address there first`);
  return { location_id, location_name: loc.location_name, source_of_supply: loc.state_code };
}

// Everything still assigned to a user — must be empty before deleting or changing their role
async function workload(u) {
  const [reports, approvals, owned, allocated] = await Promise.all([
    User.countDocuments({ managerId: u._id }),
    Bill.countDocuments({ approverId: u._id, status: 'PENDING' }),
    Bill.countDocuments({ ownerId: u._id, status: OPEN }),
    Bill.countDocuments({ 'allocations.pmId': u._id, status: OPEN }),
  ]);
  return { reports, approvals, owned, allocated };
}
const describe = w => [
  w.reports && `${w.reports} people report to them`,
  w.approvals && `${w.approvals} bill(s) wait on their approval`,
  w.owned && `they own ${w.owned} open bill(s)`,
  w.allocated && `${w.allocated} open bill(s) are assigned to them`,
].filter(Boolean).join(', ');

// ── List every user in the org ────────────────────────────────────────────
r.get('/users', h(async (req, res) => {
  const users = await User.find({ financeOrgId: req.user.financeOrgId }, '-passwordHash').populate('managerId', 'name role').sort('role name').lean();
  // open workload per user, so the UI can show what a transfer would move
  const counts = await Promise.all(users.map(u => workload(u)));
  res.json(users.map((u, i) => ({ ...u, workload: counts[i] })));
}));

// ── Create a PM / CM / OM / FM ─────────────────────────────────────────────
r.post('/users', h(async (req, res) => {
  const { name, email, password, role, managerId, location_id } = req.body;
  if (!name || !email || !password) throw httpError(400, 'Name, email and password are required');
  if (!STAFF_ROLES.includes(role)) throw httpError(400, 'Role must be PM, CM, OM or FM (there is only one Admin)');
  if (await User.exists({ email })) throw httpError(409, 'A user with this email already exists');
  const org = req.user.financeOrgId;
  const user = await User.create({
    name, email, role,
    passwordHash: await bcrypt.hash(password, 10),
    managerId: await checkManager(role, managerId, org),
    ...(await resolveLocation(role, location_id, org)),
    financeOrgId: org,
  });
  res.json({ id: user.id, name: user.name, role: user.role });
}));

// ── Change role, reporting line or default location ────────────────────────
r.patch('/users/:id', h(async (req, res) => {
  const org = req.user.financeOrgId;
  const u = await findUser(req.params.id, org);
  if (!u || u.role === 'ADMIN') throw httpError(404, 'User not found');
  const role = req.body.role || u.role;
  if (!STAFF_ROLES.includes(role)) throw httpError(400, 'Role must be PM, CM, OM or FM');

  if (role !== u.role) {
    const w = await workload(u);
    if (w.reports || w.approvals || w.owned || w.allocated)
      throw httpError(409, `Can't change ${u.name}'s role yet: ${describe(w)}. Transfer or finish that work first.`);
  }
  const oldManager = u.managerId;
  // Keep the current manager if it's still valid for the role, unless a new one is given
  const wantManager = 'managerId' in req.body ? req.body.managerId : (role === u.role ? u.managerId : null);
  u.managerId = await checkManager(role, wantManager, org);
  // Location: only looked up in Zoho when it changes; a PM must always have one
  if ('location_id' in req.body && req.body.location_id !== u.location_id) Object.assign(u, await resolveLocation(role, req.body.location_id, org));
  else if (role === 'PM' && !u.location_id) throw httpError(400, 'A Property Manager needs a default location');
  u.role = role;
  await u.save();

  // New manager: bills this user owns that are waiting on the old manager follow to the new one
  let moved = 0;
  if (oldManager && u.managerId && String(oldManager) !== String(u.managerId)) {
    moved = (await Bill.updateMany(
      { ownerId: u._id, status: 'PENDING', approverId: oldManager },
      { $set: { approverId: u.managerId } })).modifiedCount;
  }
  res.json({ ok: true, movedBills: moved });
}));

// ── Transfer a CM / OM / FM's entire workload to another user of the same role ──
// Moves: bills waiting on their approval, the people reporting to them, and bills they own.
r.post('/users/:id/transfer', h(async (req, res) => {
  const org = req.user.financeOrgId;
  const from = await findUser(req.params.id, org);
  const to = await findUser(req.body.toUserId, org);
  if (!from || !to) throw httpError(404, 'User not found');
  if (!TRANSFER_ROLES.includes(from.role)) throw httpError(400, 'Only CM, OM and FM workloads can be transferred');
  if (from.role !== to.role) throw httpError(400, `Pick another ${ROLE_NAME[from.role]} — workloads move between the same role only`);
  if (String(from._id) === String(to._id)) throw httpError(400, 'Pick a different user');

  const [approvals, reports, owned] = await Promise.all([
    Bill.updateMany({ approverId: from._id, status: 'PENDING' }, { $set: { approverId: to._id } }),
    User.updateMany({ managerId: from._id }, { $set: { managerId: to._id } }),
    Bill.updateMany({ ownerId: from._id }, { $set: { ownerId: to._id } }),
  ]);
  res.json({ ok: true, approvals: approvals.modifiedCount, reports: reports.modifiedCount, bills: owned.modifiedCount });
}));

// ── Delete a user — only once nothing is assigned to them ───────────────────
r.delete('/users/:id', h(async (req, res) => {
  const u = await findUser(req.params.id, req.user.financeOrgId);
  if (!u || u.role === 'ADMIN') throw httpError(404, 'User not found');
  const w = await workload(u);
  if (w.reports || w.approvals || w.owned || w.allocated)
    throw httpError(409, `Can't delete ${u.name} yet: ${describe(w)}.${TRANSFER_ROLES.includes(u.role) ? ' Transfer their workload first.' : ''}`);
  await u.deleteOne();
  res.json({ ok: true });
}));

export default r;
