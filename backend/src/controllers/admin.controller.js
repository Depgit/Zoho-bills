// Admin-only user management, scoped to the Admin's org
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { httpError } from '../utils/httpError.js';
import { ROLE_NAME, STAFF_ROLES, TRANSFER_ROLES } from '../services/hierarchy.service.js';
import { checkManager, resolveUserLocation } from '../services/users/validation.js';
import { describeWork, hasWork, workload } from '../services/users/workload.js';
import { followNewManager, transferWorkload } from '../services/users/transfer.js';

const findUser = (id, financeOrgId) => User.findOne({ _id: id, financeOrgId });

// Everyone in the org, with their manager and open workload
export async function listUsers(req, res) {
  const users = await User.find({ financeOrgId: req.user.financeOrgId }, '-passwordHash')
    .populate('managerId', 'name role')
    .sort('role name')
    .lean();
  const counts = await Promise.all(users.map(workload));
  res.json(users.map((u, i) => ({ ...u, workload: counts[i] })));
}

export async function createUser(req, res) {
  const { name, email, password, role, managerId, location_id } = req.body;
  if (!name || !email || !password) throw httpError(400, 'Name, email and password are required');
  if (!STAFF_ROLES.includes(role)) throw httpError(400, 'Role must be PM, CM, OM or FM (there is only one Admin)');
  if (await User.exists({ email })) throw httpError(409, 'A user with this email already exists');

  const org = req.user.financeOrgId;
  const user = await User.create({
    name,
    email,
    role,
    passwordHash: await bcrypt.hash(password, 10),
    managerId: await checkManager(role, managerId, org),
    ...(await resolveUserLocation(role, location_id, org)),
    financeOrgId: org,
  });
  res.json({ id: user.id, name: user.name, role: user.role });
}

// Change role, reporting line or default location
export async function updateUser(req, res) {
  const org = req.user.financeOrgId;
  const u = await findUser(req.params.id, org);
  if (!u || u.role === 'ADMIN') throw httpError(404, 'User not found');
  const role = req.body.role || u.role;
  if (!STAFF_ROLES.includes(role)) throw httpError(400, 'Role must be PM, CM, OM or FM');

  if (role !== u.role) {
    const w = await workload(u);
    if (hasWork(w)) {
      throw httpError(409, `Can't change ${u.name}'s role yet: ${describeWork(w)}. Transfer or finish that work first.`);
    }
  }

  const oldManager = u.managerId;
  // Keep the current manager if it's still valid for the role, unless a new one is given
  const wantManager = 'managerId' in req.body ? req.body.managerId : role === u.role ? u.managerId : null;
  u.managerId = await checkManager(role, wantManager, org);

  // Location is only looked up in Zoho when it changes; a PM must always have one
  if ('location_id' in req.body && req.body.location_id !== u.location_id) {
    Object.assign(u, await resolveUserLocation(role, req.body.location_id, org));
  } else if (role === 'PM' && !u.location_id) {
    throw httpError(400, 'A Property Manager needs a default location');
  }

  u.role = role;
  await u.save();
  res.json({ ok: true, movedBills: await followNewManager(u._id, oldManager, u.managerId) });
}

// Transfer a CM / OM / FM's entire workload to another user of the same role
export async function transferUser(req, res) {
  const org = req.user.financeOrgId;
  const from = await findUser(req.params.id, org);
  const to = await findUser(req.body.toUserId, org);
  if (!from || !to) throw httpError(404, 'User not found');
  if (!TRANSFER_ROLES.includes(from.role)) throw httpError(400, 'Only CM, OM and FM workloads can be transferred');
  if (from.role !== to.role) {
    throw httpError(400, `Pick another ${ROLE_NAME[from.role]} — workloads move between the same role only`);
  }
  if (String(from._id) === String(to._id)) throw httpError(400, 'Pick a different user');
  res.json({ ok: true, ...(await transferWorkload(from._id, to._id)) });
}

// Delete a user — only once nothing is assigned to them
export async function deleteUser(req, res) {
  const u = await findUser(req.params.id, req.user.financeOrgId);
  if (!u || u.role === 'ADMIN') throw httpError(404, 'User not found');
  const w = await workload(u);
  if (hasWork(w)) {
    const hint = TRANSFER_ROLES.includes(u.role) ? ' Transfer their workload first.' : '';
    throw httpError(409, `Can't delete ${u.name} yet: ${describeWork(w)}.${hint}`);
  }
  await u.deleteOne();
  res.json({ ok: true });
}
