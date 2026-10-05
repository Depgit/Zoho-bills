// Each uploader's default expense account per vendor
import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { updatedAt } from './columns.js';
import { users } from './users.js';

export const vendorAccountMaps = pgTable(
  'vendor_account_maps',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: text('vendor_id').notNull(),
    accountId: text('account_id').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.vendorId] })],
);
