// File records (the bytes are in file storage — see src/storage)
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { isUuid } from '../ids.js';
import { bills, files } from '../schema/index.js';

export async function create(file) {
  const [row] = await db.insert(files).values(file).returning();
  return row;
}

export const findById = async (id) => (isUuid(id) ? (await db.select().from(files).where(eq(files.id, id)).limit(1))[0] || null : null);

export const remove = (id) => db.delete(files).where(eq(files.id, id));

// Files older than `ms` that no bill points to (uploaded for extraction but never saved)
export const orphans = (ms) =>
  db
    .select()
    .from(files)
    .where(
      and(
        lt(files.createdAt, new Date(Date.now() - ms)),
        sql`not exists (select 1 from ${bills} where ${bills.fileId} = ${files.id})`,
      ),
    );
