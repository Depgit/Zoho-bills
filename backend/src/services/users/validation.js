// Rules for creating / changing users
import { usersRepo } from '../../db/index.js';
import { httpError } from '../../utils/httpError.js';
import { MANAGER_ROLE, ROLE_NAME } from '../hierarchy.service.js';
import { findLocation } from '../locations.service.js';

// Manager must exist in this org and have the role directly above `role` (FM: no manager)
export async function checkManager(role, managerId, financeOrgId) {
  const want = MANAGER_ROLE[role];
  if (!want) return null;
  const manager = managerId && (await usersRepo.findInOrg(managerId, financeOrgId));
  if (!manager || manager.role !== want) {
    throw httpError(400, `A ${ROLE_NAME[role]} must report to a ${ROLE_NAME[want]} — pick one`);
  }
  return manager.id;
}

// Default location → { location_id, location_name, source_of_supply }. Required for PMs.
export async function resolveUserLocation(role, locationId, financeOrgId) {
  if (locationId) return findLocation(financeOrgId, locationId);
  if (role === 'PM') throw httpError(400, 'A Property Manager needs a default location');
  return { location_id: '', location_name: '', source_of_supply: '' };
}
