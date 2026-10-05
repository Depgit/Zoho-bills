// Organisation registration: checks the Zoho credentials, then creates the org and its one Admin
import { orgsRepo, usersRepo } from '../../db/index.js';
import { validateZohoCredentials } from '../../integrations/zoho/index.js';
import { hashPassword } from '../../security/passwords.js';
import { httpError } from '../../utils/httpError.js';
import { syncContacts } from '../vendors/index.js';
import { sessionFor } from './session.js';

export async function registerOrg(body) {
  const { name, email, password, zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId } = body;
  const zohoAccountsUrl = body.zohoAccountsUrl || 'https://accounts.zoho.in';
  const zohoApiUrl = body.zohoApiUrl || 'https://www.zohoapis.in';

  if (!name || !email || !password) throw httpError(400, 'name, email and password are required');
  if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken || !zohoOrgId) {
    throw httpError(400, 'All four Zoho credentials are required (Client ID, Secret, Refresh Token, Org ID)');
  }
  if (await usersRepo.emailTaken(email)) throw httpError(409, 'An account with this email already exists');
  if (await orgsRepo.zohoOrgTaken(zohoOrgId)) {
    throw httpError(409, 'This Zoho organisation is already registered — ask its Admin for an account');
  }

  const zoho = { zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId, zohoAccountsUrl, zohoApiUrl };
  let displayName;
  try {
    displayName = await validateZohoCredentials(zoho);
  } catch (e) {
    throw httpError(422, 'Zoho validation failed: ' + e.message);
  }

  const { org, admin } = await orgsRepo.createWithAdmin(
    { ...zoho, displayName },
    { name, email, passwordHash: await hashPassword(password) },
  );
  // Sync vendors for the new org in the background
  syncContacts(org).catch((e) => console.error('Initial contacts sync failed:', e.message));
  return { ...sessionFor(admin), zohoOrgName: displayName };
}
