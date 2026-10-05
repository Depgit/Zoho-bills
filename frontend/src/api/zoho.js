// Zoho reference data — loaded once per session and reused (Refresh / the vendor refresh button reload it)
import { api } from './client.js';
import { cached } from './cache.js';

const get = (path) => async () => (await api.get(path)).data;

export const accounts = ({ force } = {}) => cached('zoho:accounts', get('/zoho/accounts'), { force });
export const taxes = ({ force } = {}) => cached('zoho:taxes', get('/zoho/taxes'), { force });
export const locations = ({ force } = {}) => cached('zoho:locations', get('/zoho/locations'), { force });
export const contacts = ({ force } = {}) => cached('zoho:contacts', get('/zoho/contacts'), { force });
