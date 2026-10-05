// Each uploader's default expense account per vendor
import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { vendorAccountMaps } from '../schema/index.js';

// { vendorId: account_id }
export async function mapFor(userId) {
  const rows = await db.select().from(vendorAccountMaps).where(eq(vendorAccountMaps.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.vendorId, r.accountId]));
}

export const set = (userId, vendorId, accountId) =>
  db
    .insert(vendorAccountMaps)
    .values({ userId, vendorId, accountId })
    .onConflictDoUpdate({
      target: [vendorAccountMaps.userId, vendorAccountMaps.vendorId],
      set: { accountId, updatedAt: new Date() },
    });
