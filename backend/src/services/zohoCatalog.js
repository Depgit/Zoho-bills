// Zoho reference data for the UI (accounts, taxes, locations), cached 5 minutes per org
import * as zoho from '../integrations/zoho/index.js';

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map(); // `${orgId}:${name}` → { t, v }

const cached = (name, load) => async (org) => {
  const key = `${org.id}:${name}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  const v = await load(org);
  cache.set(key, { t: Date.now(), v });
  return v;
};

export const accounts = cached('accounts', zoho.accounts);
export const taxes = cached('taxes', zoho.taxes);
export const locations = cached('locations', zoho.locations);
