// Bills: lists (cached per scope — filtering happens in the browser), save, delete, approve / reject, files
import { api } from './client.js';
import { cached, invalidate } from './cache.js';

// Every bill of a scope ('history' | 'queue' | 'mine') → { rows, total, truncated }
// Cached until refreshed (force) or a bill changes.
export const allBills = (scope, { force } = {}) =>
  cached(`bills:${scope}`, async () => (await api.get('/bills', { params: { scope, all: 1 } })).data, { force });

export const team = ({ force } = {}) => cached('team', async () => (await api.get('/bills/team')).data, { force });
export const assignablePms = ({ force } = {}) => cached('assignable-pms', async () => (await api.get('/bills/assignable-pms')).data, { force });

// Anything that changes a bill makes the cached lists stale
const changed = (result) => {
  invalidate('bills:');
  return result;
};
export const extractBill = async (formData) => (await api.post('/bills/extract', formData)).data;
export const saveBill = async (id, body) => changed((id ? await api.put(`/bills/${id}`, body) : await api.post('/bills', body)).data);
export const deleteBill = async (id) => changed(await api.delete(`/bills/${id}`));
export const decideBill = async (id, action, body) => changed((await api.post(`/bills/${id}/${action}`, body)).data);
export const billFile = async (id) => (await api.get(`/bills/${id}/pdf`, { responseType: 'blob' })).data;

export const vendorAccounts = ({ force } = {}) => cached('vendor-accounts', async () => (await api.get('/bills/vendor-account-map')).data, { force });
export const rememberVendorAccount = (vendorId, accountId) => {
  invalidate('vendor-accounts');
  return api.post('/bills/vendor-account-map', { vendorId, account_id: accountId });
};
