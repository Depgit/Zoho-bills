// Admin user management, scoped to the Admin's org
import { usersRepo } from '../../db/index.js';
import { hashPassword } from '../../security/passwords.js';
import { httpError } from '../../utils/httpError.js';
import { ROLE_NAME, STAFF_ROLES, TRANSFER_ROLES } from '../hierarchy.service.js';
import { checkManager, resolveUserLocation } from './validation.js';
import { describeWork, hasWork, workload } from './workload.js';
import { followNewManager, transferWorkload } from './transfer.js';

// Everyone in the org, with their manager and open workload
export async function listUsers(financeOrgId) {
  const users = await usersRepo.listByOrg(financeOrgId);
  const counts = await Promise.all(users.map(workload));
  return users.map((u, i) => ({ ...u, workload: counts[i] }));
}

export async function createUser(financeOrgId, { name, email, password, role, managerId, location_id }) {
  if (!name || !email || !password) throw httpError(400, 'Name, email and password are required');
  if (!STAFF_ROLES.includes(role)) throw httpError(400, 'Role must be PM, CM, OM or FM (there is only one Admin)');
  if (await usersRepo.emailTaken(email)) throw httpError(409, 'A user with this email already exists');
  const user = await usersRepo.create({
    name,
    email,
    role,
    passwordHash: await hashPassword(password),
    managerId: await checkManager(role, managerId, financeOrgId),
    ...(await resolveUserLocation(role, location_id, financeOrgId)),
    financeOrgId,
  });
  return { id: user.id, name: user.name, role: user.role };
}

const staffMember = async (id, financeOrgId) => {
  const u = await usersRepo.findInOrg(id, financeOrgId);
  if (!u || u.role === 'ADMIN') throw httpError(404, 'User not found');
  return u;
};

// Change role, reporting line or default location → number of bills that followed a new manager
export async function updateUser(financeOrgId, id, body) {
  const u = await staffMember(id, financeOrgId);
  const role = body.role || u.role;
  if (!STAFF_ROLES.includes(role)) throw httpError(400, 'Role must be PM, CM, OM or FM');

  if (role !== u.role) {
    const w = await workload(u);
    if (hasWork(w)) throw httpError(409, `Can't change ${u.name}'s role yet: ${describeWork(w)}. Transfer or finish that work first.`);
  }

  // Keep the current manager if it's still valid for the role, unless a new one is given
  const wantManager = 'managerId' in body ? body.managerId : role === u.role ? u.managerId : null;
  const patch = { role, managerId: await checkManager(role, wantManager, financeOrgId) };

  // Location is only looked up in Zoho when it changes; a PM must always have one
  if ('location_id' in body && body.location_id !== u.location_id) {
    Object.assign(patch, await resolveUserLocation(role, body.location_id, financeOrgId));
  } else if (role === 'PM' && !u.location_id) {
    throw httpError(400, 'A Property Manager needs a default location');
  }

  await usersRepo.update(u.id, patch);
  return followNewManager(u.id, u.managerId, patch.managerId);
}

// Transfer a CM / OM / FM's entire workload to another user of the same role
export async function transferUser(financeOrgId, fromId, toId) {
  const [from, to] = await Promise.all([usersRepo.findInOrg(fromId, financeOrgId), usersRepo.findInOrg(toId, financeOrgId)]);
  if (!from || !to) throw httpError(404, 'User not found');
  if (!TRANSFER_ROLES.includes(from.role)) throw httpError(400, 'Only CM, OM and FM workloads can be transferred');
  if (from.role !== to.role) throw httpError(400, `Pick another ${ROLE_NAME[from.role]} — workloads move between the same role only`);
  if (from.id === to.id) throw httpError(400, 'Pick a different user');
  return transferWorkload(from.id, to.id);
}

// Delete a user — only once nothing is assigned to them
export async function deleteUser(financeOrgId, id) {
  const u = await staffMember(id, financeOrgId);
  const w = await workload(u);
  if (hasWork(w)) {
    const hint = TRANSFER_ROLES.includes(u.role) ? ' Transfer their workload first.' : '';
    throw httpError(409, `Can't delete ${u.name} yet: ${describeWork(w)}.${hint}`);
  }
  await usersRepo.remove(u.id);
}
