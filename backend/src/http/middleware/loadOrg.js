import { orgsRepo } from '../../db/index.js';
import { httpError } from '../../utils/httpError.js';
import { asyncHandler } from './asyncHandler.js';

// Attach the logged-in user's organisation (with Zoho credentials) as req.financeOrg
export const loadOrg = asyncHandler(async (req, res, next) => {
  if (!req.user.financeOrgId) throw httpError(403, 'Your account is not linked to an organisation');
  const org = await orgsRepo.findById(req.user.financeOrgId);
  if (!org) throw httpError(403, 'Organisation not found');
  req.financeOrg = org;
  next();
});
