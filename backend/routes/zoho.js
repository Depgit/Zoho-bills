import { Router } from 'express';
import { auth } from '../mw.js';
import { UPLOAD_ROLES } from '../hierarchy.js';
import * as zoho from '../zoho.js';
import { FinanceOrg } from '../models.js';
const r = Router();

// Per-org cache: orgId_key -> { t, v }
const cache = {};

/**
 * Middleware: load the FinanceOrg document for the requesting user and attach it to req.financeOrg
 * Every user (Admin, FM, OM, CM, PM) belongs to one org via financeOrgId
 */
async function loadOrg(req, res, next) {
  try {
    if (!req.user.financeOrgId) return res.status(403).json({ error: 'No Finance Org linked to your account' });
    const org = await FinanceOrg.findById(req.user.financeOrgId);
    if (!org) return res.status(403).json({ error: 'Finance Org not found' });
    req.financeOrg = org;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

const orgCached = (suffix, fn) => [loadOrg, async (req, res) => {
  const key = `${req.user.financeOrgId}_${suffix}`;
  try {
    if (!cache[key] || Date.now() - cache[key].t > 3e5) cache[key] = { t: Date.now(), v: await fn(req.financeOrg) };
    res.json(cache[key].v);
  } catch (e) { res.status(502).json({ error: e.response?.data?.message || e.message }); }
}];

r.get('/accounts', auth(...UPLOAD_ROLES), ...orgCached('accounts', zoho.accounts));
r.get('/taxes', auth(), ...orgCached('taxes', zoho.taxes));
r.get('/contacts', auth(...UPLOAD_ROLES), [loadOrg, async (req, res) => {
  try {
    res.json(await zoho.contacts(req.financeOrg, req.query.search || ''));
  } catch (e) { res.status(502).json({ error: e.response?.data?.message || e.message }); }
}]);
r.get('/locations', auth(), ...orgCached('locations', zoho.locations));

// Trigger manual re-sync of contacts for this org
r.post('/sync', auth('ADMIN', 'FM'), loadOrg, async (req, res) => {
  try {
    await zoho.fullSync(req.financeOrg);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: e.response?.data?.message || e.message }); }
});

export default r;
