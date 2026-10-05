// Bill search criteria → SQL. The services describe WHAT to find (plain objects);
// this file is the only place that knows how that becomes a WHERE / ORDER BY.
//
// criteria = {
//   financeOrgId,                                   always
//   visibleTo: { pmIds, ownerId, approverId, actedById }   any of these (omit = all bills in the org)
//   statuses: [], stages: [], from, to,             date range on the bill date (else created date)
//   q,                                              text: bill no, vendor, PM / property, comments
//   pmId ('unassigned' = no PM yet), area: { userIds, approverId }, ownerId, approverId, vendorId,
//   accountId (a line uses this expense account), minAmount, maxAmount, hasZohoError,
//   amountForPm,                                    amounts = this PM's share instead of the bill total
// }
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { billAllocations, billHistory, billLineItems, bills, users } from '../../schema/index.js';

const like = (q) => `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;

// Bill date, or the day it was created for drafts without a date
export const billDay = sql`coalesce(${bills.billDate}, (${bills.createdAt} at time zone 'Asia/Kolkata')::date)`;

const allocatedTo = (ids) =>
  sql`exists (select 1 from ${billAllocations} where ${billAllocations.billId} = ${bills.id} and ${inArray(billAllocations.pmId, ids)})`;

const unassigned = sql`not exists (select 1 from ${billAllocations} where ${billAllocations.billId} = ${bills.id} and ${billAllocations.pmId} is not null)`;

const actedBy = (userId) =>
  sql`exists (select 1 from ${billHistory} where ${billHistory.billId} = ${bills.id} and ${billHistory.byId} = ${userId})`;

// A PM's share of a bill
const shareOf = (pmId) =>
  sql`coalesce((select sum(${billAllocations.amount}) from ${billAllocations} where ${billAllocations.billId} = ${bills.id} and ${billAllocations.pmId} = ${pmId}), 0)`;

// The amount shown for a bill: the PM's share, or the bill total
export const amountOf = (c) => (c.amountForPm ? shareOf(c.amountForPm) : bills.total);

// The amount that belongs to the property being looked at: the filtered property's share, else as amountOf
export const propertyAmountOf = (c) => (c.pmId && c.pmId !== 'unassigned' ? shareOf(c.pmId) : amountOf(c));

function visible({ pmIds = [], ownerId, approverId, actedById }) {
  const any = [];
  if (pmIds.length) any.push(allocatedTo(pmIds));
  if (ownerId) any.push(eq(bills.ownerId, ownerId));
  if (approverId) any.push(eq(bills.approverId, approverId));
  if (actedById) any.push(actedBy(actedById));
  return any.length ? or(...any) : sql`false`;
}

function textSearch(q) {
  const p = like(q);
  return or(
    ilike(bills.billNumber, p),
    ilike(bills.vendorName, p),
    sql`exists (select 1 from ${billAllocations} join ${users} on ${users.id} = ${billAllocations.pmId}
                where ${billAllocations.billId} = ${bills.id} and (${users.name} ilike ${p} or ${users.locationName} ilike ${p}))`,
    sql`exists (select 1 from ${billHistory} where ${billHistory.billId} = ${bills.id} and ${billHistory.comment} ilike ${p})`,
  );
}

export function whereOf(c) {
  const parts = [eq(bills.financeOrgId, c.financeOrgId)];
  if (c.visibleTo) parts.push(visible(c.visibleTo));
  if (c.statuses?.length) parts.push(inArray(bills.status, c.statuses));
  if (c.stages?.length) parts.push(inArray(bills.stage, c.stages));
  if (c.from) parts.push(gte(billDay, c.from));
  if (c.to) parts.push(lte(billDay, c.to));
  if (c.ownerId) parts.push(eq(bills.ownerId, c.ownerId));
  if (c.approverId) parts.push(eq(bills.approverId, c.approverId));
  if (c.vendorId) parts.push(eq(bills.vendorId, c.vendorId));
  if (c.pmId) parts.push(c.pmId === 'unassigned' ? unassigned : allocatedTo([c.pmId]));
  if (c.area) {
    const { userIds = [], approverId } = c.area;
    const any = userIds.length ? [allocatedTo(userIds), inArray(bills.ownerId, userIds)] : [];
    if (approverId) any.push(eq(bills.approverId, approverId));
    parts.push(any.length ? or(...any) : sql`false`);
  }
  if (c.accountId) {
    parts.push(sql`exists (select 1 from ${billLineItems} where ${billLineItems.billId} = ${bills.id} and ${billLineItems.accountId} = ${c.accountId})`);
  }
  if (c.hasZohoError) parts.push(and(isNotNull(bills.zohoError), ne(bills.zohoError, '')));
  if (c.q) parts.push(textSearch(c.q));
  if (c.minAmount != null) parts.push(gte(amountOf(c), c.minAmount));
  if (c.maxAmount != null) parts.push(lte(amountOf(c), c.maxAmount));
  return and(...parts);
}

const SORT_COLUMNS = {
  date: () => billDay,
  amount: (c) => amountOf(c),
  billNumber: () => bills.billNumber,
  vendor: () => bills.vendorName,
  status: () => bills.status,
  updated: () => bills.updatedAt,
};

// sort = { field, dir: 'asc' | 'desc' }; ties broken by last update, then id (stable pages)
export function orderOf(c, sort = {}) {
  const col = (SORT_COLUMNS[sort.field] || SORT_COLUMNS.updated)(c);
  const dir = sort.dir === 'asc' ? asc : desc;
  return [dir(col), desc(bills.updatedAt), asc(bills.id)];
}
