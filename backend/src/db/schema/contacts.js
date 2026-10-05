// Zoho vendor contacts, synced per org
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { financeOrgs } from './financeOrgs.js';

export const contacts = pgTable(
  'contacts',
  {
    financeOrgId: uuid('finance_org_id')
      .notNull()
      .references(() => financeOrgs.id, { onDelete: 'cascade' }),
    contactId: text('contact_id').notNull(),
    contactName: text('contact_name').notNull().default(''),
    gstNo: text('gst_no').notNull().default(''),
    status: text('status').notNull().default(''),
    lastModifiedTime: text('last_modified_time').notNull().default(''),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.financeOrgId, t.contactId] }),
    index('contacts_name_trgm_idx').using('gin', sql`${t.contactName} gin_trgm_ops`),
  ],
);
