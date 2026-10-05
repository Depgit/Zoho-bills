// Bills: lists with filters, totals, save, delete, approve / reject, files
import { api } from './client.js';

// params: { scope, status, stage, from, to, q, pmId, managerId, vendorId, minAmt, maxAmt, hasZohoError, sort, page, pageSize }
// → { rows, total, page, pageSize, summary }
export const listBills = async (params, signal) => (await api.get('/bills', { params, signal })).data;
export const propertyTotals = async (params, signal) => (await api.get('/bills/properties', { params, signal })).data;
export const expenseTotals = async (params, signal) => (await api.get('/bills/expenses', { params, signal })).data;
export const team = async () => (await api.get('/bills/team')).data;
export const assignablePms = async () => (await api.get('/bills/assignable-pms')).data;

export const extractBill = async (formData) => (await api.post('/bills/extract', formData)).data;
export const saveBill = async (id, body) => (id ? await api.put(`/bills/${id}`, body) : await api.post('/bills', body)).data;
export const deleteBill = (id) => api.delete(`/bills/${id}`);
export const decideBill = async (id, action, body) => (await api.post(`/bills/${id}/${action}`, body)).data;
export const billFile = async (id) => (await api.get(`/bills/${id}/pdf`, { responseType: 'blob' })).data;

export const vendorAccounts = async () => (await api.get('/bills/vendor-account-map')).data;
export const rememberVendorAccount = (vendorId, accountId) => api.post('/bills/vendor-account-map', { vendorId, account_id: accountId });
