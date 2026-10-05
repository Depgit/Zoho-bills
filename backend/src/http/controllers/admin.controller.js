// Admin-only user management (all scoped to the Admin's org)
import * as users from '../../services/users/index.js';

const org = (req) => req.user.financeOrgId;

export const listUsers = async (req, res) => res.json(await users.listUsers(org(req)));

export const createUser = async (req, res) => res.json(await users.createUser(org(req), req.body));

export const updateUser = async (req, res) =>
  res.json({ ok: true, movedBills: await users.updateUser(org(req), req.params.id, req.body) });

export const transferUser = async (req, res) =>
  res.json({ ok: true, ...(await users.transferUser(org(req), req.params.id, req.body.toUserId)) });

export async function deleteUser(req, res) {
  await users.deleteUser(org(req), req.params.id);
  res.json({ ok: true });
}
