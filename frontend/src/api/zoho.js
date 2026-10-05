// Zoho reference data (cached by the server)
import { api } from './client.js';

export const accounts = async () => (await api.get('/zoho/accounts')).data;
export const taxes = async () => (await api.get('/zoho/taxes')).data;
export const locations = async () => (await api.get('/zoho/locations')).data;
export const contacts = async (search = '') => (await api.get('/zoho/contacts', { params: search ? { search } : {} })).data;
