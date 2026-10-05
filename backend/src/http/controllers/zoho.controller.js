// Zoho reference data for the UI
import * as catalog from '../../services/zohoCatalog.js';
import { searchContacts, syncContacts } from '../../services/vendors/index.js';
import { httpError } from '../../utils/httpError.js';

// Zoho failures → 502 with Zoho's own message
const fromZoho = (load) => async (req, res) => {
  try {
    res.json(await load(req));
  } catch (e) {
    if (e.status) throw e;
    throw httpError(502, e.response?.data?.message || e.message);
  }
};

export const accounts = fromZoho((req) => catalog.accounts(req.financeOrg));
export const taxes = fromZoho((req) => catalog.taxes(req.financeOrg));
export const locations = fromZoho((req) => catalog.locations(req.financeOrg));
export const contacts = fromZoho((req) => searchContacts(req.financeOrg, req.query.search || ''));
export const sync = fromZoho(async (req) => {
  await syncContacts(req.financeOrg);
  return { ok: true };
});
