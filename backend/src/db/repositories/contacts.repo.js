// Zoho vendor contacts cached per org
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '../client.js';
import { contacts } from '../schema/index.js';

const BATCH = 500;

// Replace the org's contacts with a fresh list from Zoho, atomically
export function replaceAll(financeOrgId, list) {
  return db.transaction(async (tx) => {
    await tx.delete(contacts).where(eq(contacts.financeOrgId, financeOrgId));
    const rows = list.map((c) => ({
      financeOrgId,
      contactId: c.contact_id,
      contactName: c.contact_name || '',
      gstNo: c.gst_no || '',
      status: c.status || '',
      lastModifiedTime: c.last_modified_time || '',
      syncedAt: new Date(),
    }));
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.insert(contacts).values(rows.slice(i, i + BATCH)).onConflictDoNothing();
    }
  });
}

const toContact = (r) => ({ contact_id: r.contactId, contact_name: r.contactName, gst_no: r.gstNo });

export async function search(financeOrgId, text = '') {
  const where = text
    ? and(eq(contacts.financeOrgId, financeOrgId), ilike(contacts.contactName, `%${text.replace(/[\\%_]/g, '\\$&')}%`))
    : eq(contacts.financeOrgId, financeOrgId);
  return (await db.select().from(contacts).where(where).orderBy(asc(contacts.contactName))).map(toContact);
}

export async function gstOf(financeOrgId, contactId) {
  if (!contactId) return '';
  const [r] = await db
    .select({ gstNo: contacts.gstNo })
    .from(contacts)
    .where(and(eq(contacts.financeOrgId, financeOrgId), eq(contacts.contactId, contactId)))
    .limit(1);
  return r?.gstNo || '';
}

// contactId → GSTIN for many vendors at once
export async function gstMap(financeOrgId, contactIds) {
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await db
    .select({ contactId: contacts.contactId, gstNo: contacts.gstNo })
    .from(contacts)
    .where(and(eq(contacts.financeOrgId, financeOrgId), inArray(contacts.contactId, ids)));
  return Object.fromEntries(rows.map((r) => [r.contactId, r.gstNo]));
}
