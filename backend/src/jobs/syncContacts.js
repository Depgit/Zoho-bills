// On startup: sync Zoho vendor contacts for every registered organisation
import { orgsRepo } from '../db/index.js';
import { syncContacts } from '../services/vendors/index.js';

export async function syncAllContacts() {
  try {
    const orgs = await orgsRepo.list();
    if (!orgs.length) return console.log('No organisations registered yet — skipping contact sync');
    console.log(`Syncing Zoho contacts for ${orgs.length} organisation(s)...`);
    await Promise.all(orgs.map((org) => syncContacts(org).catch((e) => console.error(`Contacts sync failed for org ${org.zohoOrgId}:`, e.message))));
    console.log('Contacts synced');
  } catch (e) {
    console.error('Contacts sync failed:', e.message);
  }
}
