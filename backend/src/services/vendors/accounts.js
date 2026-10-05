// Each uploader's remembered expense account per vendor
import { vendorAccountsRepo } from '../../db/index.js';
import { httpError } from '../../utils/httpError.js';

export const accountsFor = (userId) => vendorAccountsRepo.mapFor(userId);

export async function rememberAccount(userId, vendorId, accountId) {
  if (!vendorId || !accountId) throw httpError(400, 'vendorId and account_id required');
  await vendorAccountsRepo.set(userId, vendorId, accountId);
}
