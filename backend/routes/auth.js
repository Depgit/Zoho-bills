import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, FinanceOrg } from '../models.js';
import { h } from '../mw.js';
import { validateZohoCredentials } from '../zoho.js';
const r = Router();

// User management (create, roles, reporting, transfers) lives in routes/admin.js

// ── Organisation registration: creates the org's one Admin + its Zoho connection ──
r.post('/register', h(async (req, res) => {
  const { name, email, password, zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId, zohoAccountsUrl, zohoApiUrl } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });
  if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken || !zohoOrgId)
    return res.status(400).json({ error: 'All four Zoho credentials are required (Client ID, Secret, Refresh Token, Org ID)' });
  if (await User.exists({ email }))
    return res.status(409).json({ error: 'An account with this email already exists' });
  if (await FinanceOrg.exists({ zohoOrgId }))
    return res.status(409).json({ error: 'This Zoho organisation is already registered — ask its Admin for an account' });

  // Validate Zoho credentials — this will throw with a helpful message on failure
  let displayName;
  try {
    displayName = await validateZohoCredentials({
      zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId,
      zohoAccountsUrl: zohoAccountsUrl || 'https://accounts.zoho.in',
      zohoApiUrl: zohoApiUrl || 'https://www.zohoapis.in',
    });
  } catch (e) {
    return res.status(422).json({ error: 'Zoho validation failed: ' + e.message });
  }

  // Create the Admin first, then attach the FinanceOrg
  const user = await User.create({
    name, email, role: 'ADMIN',
    passwordHash: await bcrypt.hash(password, 10),
  });

  const org = await FinanceOrg.create({
    userId: user._id,
    zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId,
    zohoAccountsUrl: zohoAccountsUrl || 'https://accounts.zoho.in',
    zohoApiUrl: zohoApiUrl || 'https://www.zohoapis.in',
    displayName,
  });

  // Back-link user to their org
  user.financeOrgId = org._id;
  await user.save();

  // Sync vendors for this new org in the background (non-blocking)
  import('../zoho.js').then(({ fullSync }) => fullSync(org)).catch(e => console.error('Initial contacts sync failed:', e.message));

  const payload = { id: user.id, name: user.name, role: user.role, financeOrgId: org.id };
  res.json({
    token: jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' }),
    user: payload,
    zohoOrgName: displayName,
  });
}));

// ── Login (all roles) ──────────────────────────────────────────────────────
r.post('/login', h(async (req, res) => {
  const u = await User.findOne({ email: req.body.email });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.passwordHash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  const user = {
    id: u.id, name: u.name, role: u.role,
    managerId: u.managerId ? String(u.managerId) : null,
    location_id: u.location_id, location_name: u.location_name, source_of_supply: u.source_of_supply,
    financeOrgId: u.financeOrgId ? String(u.financeOrgId) : null,
  };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '12h' }), user });
}));

export default r;
