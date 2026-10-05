// Each uploader's remembered expense account per vendor
import { accountsFor, rememberAccount } from '../../services/vendors/index.js';

export const getVendorAccounts = async (req, res) => res.json(await accountsFor(req.user.id));

export async function saveVendorAccount(req, res) {
  await rememberAccount(req.user.id, req.body.vendorId, req.body.account_id);
  res.json({ ok: true });
}
