// One per organisation — created when its Admin registers; holds the Zoho credentials
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns.js';

export const financeOrgs = pgTable('finance_orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  zohoClientId: text('zoho_client_id').notNull(),
  zohoClientSecret: text('zoho_client_secret').notNull(),
  zohoRefreshToken: text('zoho_refresh_token').notNull(),
  zohoOrgId: text('zoho_org_id').notNull().unique(),
  zohoAccountsUrl: text('zoho_accounts_url').notNull().default('https://accounts.zoho.in'),
  zohoApiUrl: text('zoho_api_url').notNull().default('https://www.zohoapis.in'),
  displayName: text('display_name'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
