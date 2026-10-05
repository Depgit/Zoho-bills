// Bills and their parts: line items, PM allocations, approval history
import { sql } from 'drizzle-orm';
import { bigserial, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, decimal, money, updatedAt } from './columns.js';
import { billStatus } from './enums.js';
import { files } from './files.js';
import { financeOrgs } from './financeOrgs.js';
import { users } from './users.js';

const userRef = (name) => uuid(name).references(() => users.id, { onDelete: 'set null' });

export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    financeOrgId: uuid('finance_org_id')
      .notNull()
      .references(() => financeOrgs.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }), // null once posted to Zoho
    fileType: text('file_type').notNull().default('application/pdf'),
    extracted: jsonb('extracted'),
    vendorId: text('vendor_id').notNull().default(''),
    vendorName: text('vendor_name').notNull().default(''),
    billNumber: text('bill_number').notNull().default(''),
    billDate: date('bill_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    discountAmount: money('discount_amount').notNull().default(0),
    discountPercent: decimal('discount_percent').notNull().default(0),
    // Location picked on the form; its state decides GST vs IGST
    locationId: text('location_id').notNull().default(''),
    locationName: text('location_name').notNull().default(''),
    sourceOfSupply: text('source_of_supply').notNull().default(''),
    // DRAFT → PENDING (stage CM/OM/FM, waiting on approverId) → POSTED, or REJECTED (stage = who rejected)
    status: billStatus('status').notNull().default('DRAFT'),
    stage: text('stage').notNull().default(''),
    firstStage: text('first_stage').notNull().default(''), // owner can edit until the bill moves past this stage
    approverId: userRef('approver_id'),
    createdBy: userRef('created_by'), // who uploaded (audit only)
    ownerId: userRef('owner_id'), // who edits / resubmits — moves on transfer
    vendorGstin: text('vendor_gstin').notNull().default(''), // stamped when posted to Zoho
    zohoBillId: text('zoho_bill_id'),
    zohoError: text('zoho_error'),
    total: money('total').notNull().default(0), // subtotal + tax − discount, kept for sorting / filtering
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('bills_stage_check', sql`${t.stage} in ('', 'CM', 'OM', 'FM')`),
    index('bills_org_status_date_idx').on(t.financeOrgId, t.status, t.billDate),
    index('bills_org_updated_idx').on(t.financeOrgId, t.updatedAt),
    index('bills_owner_idx').on(t.ownerId),
    index('bills_approver_idx').on(t.approverId, t.status),
    index('bills_vendor_number_idx').on(t.financeOrgId, t.vendorId, t.billNumber),
    index('bills_file_idx').on(t.fileId),
    index('bills_number_trgm_idx').using('gin', sql`${t.billNumber} gin_trgm_ops`),
    index('bills_vendor_trgm_idx').using('gin', sql`${t.vendorName} gin_trgm_ops`),
  ],
);

export const billLineItems = pgTable(
  'bill_line_items',
  {
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull().default(''),
    description: text('description').notNull().default(''),
    quantity: decimal('quantity').notNull().default(1),
    rate: money('rate').notNull().default(0),
    accountId: text('account_id').notNull().default(''),
    taxId: text('tax_id').notNull().default(''),
    taxPercentage: decimal('tax_percentage').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.billId, t.position] })],
);

// Which PM(s) a bill belongs to and how much each (sum = bill total)
export const billAllocations = pgTable(
  'bill_allocations',
  {
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    pmId: userRef('pm_id'),
    amount: money('amount').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.billId, t.position] }), index('bill_allocations_pm_idx').on(t.pmId)],
);

export const billHistory = pgTable(
  'bill_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    byName: text('by_name').notNull().default(''),
    byId: userRef('by_id'),
    role: text('role').notNull().default(''),
    action: text('action').notNull(), // DRAFT_SAVED | SUBMITTED | RESUBMITTED | APPROVED | REJECTED | POSTED
    comment: text('comment').notNull().default(''),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bill_history_bill_idx').on(t.billId, t.at), index('bill_history_by_idx').on(t.byId)],
);
