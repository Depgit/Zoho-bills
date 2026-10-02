import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, FinanceOrg } from '../models.js';
import { auth } from '../mw.js';
import { validateZohoCredentials } from '../zoho.js';
const r = Router();

// ── Finance Manager self-registration ──────────────────────────────────────
r.post('/register-finance', async (req, res) => {
  const { name, email, password, zohoClientId, zohoClientSecret, zohoRefreshToken, zohoOrgId, zohoAccountsUrl, zohoApiUrl } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });
  if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken || !zohoOrgId)
    return res.status(400).json({ error: 'All four Zoho credentials are required (Client ID, Secret, Refresh Token, Org ID)' });
  if (await User.exists({ email }))
    return res.status(409).json({ error: 'An account with this email already exists' });

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

  // Create the User first (FINANCE role), then attach FinanceOrg
  const user = await User.create({
    name, email, role: 'FINANCE',
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
});

// ── Login (all roles) ──────────────────────────────────────────────────────
r.post('/login', async (req, res) => {
  const u = await User.findOne({ email: req.body.email });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.passwordHash)))
    return res.status(401).json({ error: 'Invalid login' });
  const user = {
    id: u.id, name: u.name, role: u.role,
    location_id: u.location_id, source_of_supply: u.source_of_supply,
    financeOrgId: u.financeOrgId ? String(u.financeOrgId) : null,
  };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '12h' }), user });
});

// ── List all PM and L1 users (Finance only — scoped to their org) ──────────
r.get('/users', auth('FINANCE'), async (req, res) => {
  const users = await User.find({ role: { $in: ['PM', 'L1'] }, financeOrgId: req.user.financeOrgId }, '-passwordHash').sort('role name');
  res.json(users);
});

// ── Create PM or L1 user (Finance only) ───────────────────────────────────
r.post('/users', auth('FINANCE'), async (req, res) => {
  const { name, email, password, role, source_of_supply, location_id, location_name } = req.body;
  if (!name || !email || !password || !['PM', 'L1'].includes(role))
    return res.status(400).json({ error: 'name, email, password and role (PM or L1) are required' });
  if (role === 'PM' && !location_id)
    return res.status(400).json({ error: 'location_id is required for Property Manager' });
  if (await User.exists({ email }))
    return res.status(409).json({ error: 'A user with this email already exists' });
  const user = await User.create({
    name, email, role,
    passwordHash: await bcrypt.hash(password, 10),
    source_of_supply: source_of_supply || '',
    location_id: location_id || '',
    location_name: location_name || '',
    financeOrgId: req.user.financeOrgId,  // Scope to this Finance Manager's org
  });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, location_id: user.location_id, location_name: user.location_name, source_of_supply: user.source_of_supply });
});

// ── Delete PM or L1 user (Finance only) ───────────────────────────────────
r.delete('/users/:id', auth('FINANCE'), async (req, res) => {
  const u = await User.findOne({ _id: req.params.id, financeOrgId: req.user.financeOrgId });
  if (!u || u.role === 'FINANCE') return res.status(404).json({ error: 'User not found' });
  await u.deleteOne();
  res.json({ ok: true });
});

export default r;
