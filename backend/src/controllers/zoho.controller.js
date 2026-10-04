// Zoho reference data for the UI, cached 5 minutes per org
import * as zoho from '../services/zoho/index.js';
import { httpError } from '../utils/httpError.js';

const CACHE_MS = 5 * 60 * 1000;
const cache = {}; // `${orgId}_${name}` → { t, v }

const zohoError = (e) => httpError(502, e.response?.data?.message || e.message);

const cached = (name, load) => async (req, res) => {
  const key = `${req.user.financeOrgId}_${name}`;
  try {
    if (!cache[key] || Date.now() - cache[key].t > CACHE_MS) cache[key] = { t: Date.now(), v: await load(req.financeOrg) };
  } catch (e) {
    throw zohoError(e);
  }
  res.json(cache[key].v);
};

export const accounts = cached('accounts', zoho.accounts);
export const taxes = cached('taxes', zoho.taxes);
export const locations = cached('locations', zoho.locations);

export async function contacts(req, res) {
  try {
    res.json(await zoho.contacts(req.financeOrg, req.query.search || ''));
  } catch (e) {
    throw zohoError(e);
  }
}

// Re-sync vendor contacts from Zoho
export async function sync(req, res) {
  try {
    await zoho.fullSync(req.financeOrg);
  } catch (e) {
    throw zohoError(e);
  }
  res.json({ ok: true });
}
