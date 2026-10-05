// Log in, and the token + user the app keeps for a session
import { usersRepo } from '../../db/index.js';
import { checkPassword } from '../../security/passwords.js';
import { signToken } from '../../security/tokens.js';
import { httpError } from '../../utils/httpError.js';

export function sessionFor(u) {
  const user = {
    id: u.id,
    name: u.name,
    role: u.role,
    managerId: u.managerId || null,
    location_id: u.location_id,
    location_name: u.location_name,
    source_of_supply: u.source_of_supply,
    financeOrgId: u.financeOrgId || null,
  };
  return { token: signToken(user), user };
}

export async function login(email, password) {
  const u = await usersRepo.findByEmail(email);
  if (!u || !(await checkPassword(password, u.passwordHash))) throw httpError(401, 'Wrong email or password');
  return sessionFor(u);
}
