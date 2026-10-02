import { Router } from 'express';
import { auth } from '../mw.js';
import * as zoho from '../zoho.js';
const r = Router();
const cache = {};
const cached = (k, fn) => async (req, res) => {
  try {
    if (!cache[k] || Date.now() - cache[k].t > 3e5) cache[k] = { t: Date.now(), v: await fn() };
    res.json(cache[k].v);
  } catch (e) { res.status(502).json({ error: e.response?.data?.message || e.message }); }
};
r.get('/accounts', auth('PM'), cached('a', zoho.accounts));
r.get('/taxes', auth('PM', 'FINANCE', 'L1'), cached('t', zoho.taxes));
r.get('/contacts', auth('PM'), cached('c', () => zoho.contacts()));
r.get('/locations', auth('FINANCE'), cached('l', zoho.locations));
export default r;
