// Organisations (with their Zoho credentials — stored encrypted, returned decrypted)
import { eq } from 'drizzle-orm';
import { decrypt, encrypt, isEncrypted } from '../../security/secrets.js';
import { db } from '../client.js';
import { isUuid } from '../ids.js';
import { financeOrgs, users } from '../schema/index.js';
import { toUser } from './users.repo.js';

const SECRET_FIELDS = ['zohoClientId', 'zohoClientSecret', 'zohoRefreshToken'];

const sealed = (org) => ({ ...org, ...Object.fromEntries(SECRET_FIELDS.filter((f) => f in org).map((f) => [f, encrypt(org[f])])) });
const opened = (row) => row && { ...row, ...Object.fromEntries(SECRET_FIELDS.map((f) => [f, decrypt(row[f])])) };

export const findById = async (id) =>
  isUuid(id) ? opened((await db.select().from(financeOrgs).where(eq(financeOrgs.id, id)).limit(1))[0]) || null : null;

export const list = async () => (await db.select().from(financeOrgs)).map(opened);

export const zohoOrgTaken = async (zohoOrgId) =>
  (await db.select({ id: financeOrgs.id }).from(financeOrgs).where(eq(financeOrgs.zohoOrgId, zohoOrgId)).limit(1)).length > 0;

// A new organisation and its Admin, together or not at all → { org, admin }
export function createWithAdmin(org, admin) {
  return db.transaction(async (tx) => {
    const [o] = await tx.insert(financeOrgs).values(sealed(org)).returning();
    const [u] = await tx.insert(users).values({ ...admin, role: 'ADMIN', financeOrgId: o.id }).returning();
    return { org: opened(o), admin: toUser(u) };
  });
}

// Encrypt credentials still stored as plain text (older rows) → how many organisations changed
export async function encryptStoredSecrets() {
  let changed = 0;
  for (const row of await db.select().from(financeOrgs)) {
    const plain = SECRET_FIELDS.filter((f) => row[f] && !isEncrypted(row[f]));
    if (!plain.length) continue;
    await db
      .update(financeOrgs)
      .set(Object.fromEntries(plain.map((f) => [f, encrypt(row[f])])))
      .where(eq(financeOrgs.id, row.id));
    changed++;
  }
  return changed;
}
