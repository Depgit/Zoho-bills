import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models.js';
import { auth } from '../mw.js';
const r = Router();

// Login (all roles)
r.post('/login', async (req, res) => {
  const u = await User.findOne({ email: req.body.email });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.passwordHash)))
    return res.status(401).json({ error: 'Invalid login' });
  const user = { id: u.id, name: u.name, role: u.role, location_id: u.location_id, source_of_supply: u.source_of_supply };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '12h' }), user });
});

// List all PM and L1 users (Finance only)
r.get('/users', auth('FINANCE'), async (req, res) => {
  const users = await User.find({ role: { $in: ['PM', 'L1'] } }, '-passwordHash').sort('role name');
  res.json(users);
});

// Create PM or L1 user (Finance only)
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
  });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, location_id: user.location_id, location_name: user.location_name, source_of_supply: user.source_of_supply });
});

// Delete PM or L1 user (Finance only)
r.delete('/users/:id', auth('FINANCE'), async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u || u.role === 'FINANCE') return res.status(404).json({ error: 'User not found' });
  await u.deleteOne();
  res.json({ ok: true });
});

export default r;
