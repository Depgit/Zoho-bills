// Each uploader's remembered expense account per vendor
import { VendorAccountMap } from '../models/index.js';
import { httpError } from '../utils/httpError.js';

export async function getVendorAccounts(req, res) {
  const maps = await VendorAccountMap.find({ userId: req.user.id });
  res.json(Object.fromEntries(maps.map((m) => [m.vendorId, m.account_id])));
}

export async function saveVendorAccount(req, res) {
  const { vendorId, account_id } = req.body;
  if (!vendorId || !account_id) throw httpError(400, 'vendorId and account_id required');
  await VendorAccountMap.findOneAndUpdate({ userId: req.user.id, vendorId }, { account_id }, { upsert: true, new: true });
  res.json({ ok: true });
}
