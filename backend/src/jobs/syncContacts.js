// On startup: sync Zoho vendor contacts for every registered organisation
import { FinanceOrg } from '../models/index.js';
import { fullSync } from '../services/zoho/index.js';

export async function syncAllContacts() {
  const orgs = await FinanceOrg.find({});
  if (!orgs.length) return console.log('No organisations registered yet — skipping contact sync');
  console.log(`Syncing Zoho contacts for ${orgs.length} organisation(s)...`);
  await Promise.all(
    orgs.map((org) => fullSync(org).catch((e) => console.error(`Contacts sync failed for org ${org.zohoOrgId}:`, e.message))),
  );
  console.log('Contacts synced');
}
