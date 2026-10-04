import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { FinanceOrg, User } from '../models/index.js';
import { httpError } from '../utils/httpError.js';
import { fullSync, validateZohoCredentials } from '../services/zoho/index.js';

const signToken = (payload) => jwt.sign(payload, JWT_SECRET(), { expiresIn: '12h' });

// Organisation registration: creates the org's one Admin + its Zoho connection
export async function register(req, res) {
  const { name, email, password, zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId } = req.body;
  const zohoAccountsUrl = req.body.zohoAccountsUrl || 'https://accounts.zoho.in';
  const zohoApiUrl = req.body.zohoApiUrl || 'https://www.zohoapis.in';

  if (!name || !email || !password) throw httpError(400, 'name, email and password are required');
  if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken || !zohoOrgId) {
    throw httpError(400, 'All four Zoho credentials are required (Client ID, Secret, Refresh Token, Org ID)');
  }
  if (await User.exists({ email })) throw httpError(409, 'An account with this email already exists');
  if (await FinanceOrg.exists({ zohoOrgId })) {
    throw httpError(409, 'This Zoho organisation is already registered — ask its Admin for an account');
  }

  let displayName;
  try {
    displayName = await validateZohoCredentials({
      zohoClientId,
      zohoClientSecret,
      zohoRefreshToken,
      zohoOrgId,
      zohoAccountsUrl,
      zohoApiUrl,
    });
  } catch (e) {
    throw httpError(422, 'Zoho validation failed: ' + e.message);
  }

  const user = await User.create({ name, email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) });
  const org = await FinanceOrg.create({
    userId: user._id,
    zohoClientId,
    zohoClientSecret,
    zohoRefreshToken,
    zohoOrgId,
    zohoAccountsUrl,
    zohoApiUrl,
    displayName,
  });
  user.financeOrgId = org._id;
  await user.save();

  // Sync vendors for the new org in the background
  fullSync(org).catch((e) => console.error('Initial contacts sync failed:', e.message));

  const payload = { id: user.id, name: user.name, role: user.role, financeOrgId: org.id };
  res.json({ token: signToken(payload), user: payload, zohoOrgName: displayName });
}

export async function login(req, res) {
  const u = await User.findOne({ email: req.body.email });
  if (!u?.passwordHash || !(await bcrypt.compare(req.body.password || '', u.passwordHash))) {
    throw httpError(401, 'Wrong email or password');
  }
  const user = {
    id: u.id,
    name: u.name,
    role: u.role,
    managerId: u.managerId ? String(u.managerId) : null,
    location_id: u.location_id,
    location_name: u.location_name,
    source_of_supply: u.source_of_supply,
    financeOrgId: u.financeOrgId ? String(u.financeOrgId) : null,
  };
  res.json({ token: signToken(user), user });
}
