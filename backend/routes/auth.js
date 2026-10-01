import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models.js';
const r = Router();
r.post('/login', async (req, res) => {
  const u = await User.findOne({ email: req.body.email });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.passwordHash))) return res.status(401).json({ error: 'Invalid login' });
  const user = { id: u.id, name: u.name, role: u.role };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '12h' }), user });
});
export default r;
