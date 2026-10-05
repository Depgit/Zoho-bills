// People: PM → CM → OM → FM (managerId = who they report to). ADMIN: one per org.
import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns.js';
import { userRole } from './enums.js';
import { financeOrgs } from './financeOrgs.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    financeOrgId: uuid('finance_org_id').references(() => financeOrgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    role: userRole('role').notNull(),
    managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
    // Default bill location; its state (sourceOfSupply) decides GST vs IGST. Required for PMs.
    locationId: text('location_id').notNull().default(''),
    locationName: text('location_name').notNull().default(''),
    sourceOfSupply: text('source_of_supply').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
    index('users_org_idx').on(t.financeOrgId),
    index('users_manager_idx').on(t.managerId),
  ],
);
