// Zoho Books API client — the only code that talks to Zoho
export { validateZohoCredentials } from './credentials.js';
export { fetchVendorContacts } from './contacts.js';
export { accounts, taxes, locations } from './catalog.js';
export { createBill, attach } from './bills.js';
