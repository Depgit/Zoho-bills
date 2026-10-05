// Reading bills: one bill, a page of bills, totals by status, totals by property
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../client.js';
import { isUuid } from '../../ids.js';
import { billAllocations, billHistory, billLineItems, bills, users } from '../../schema/index.js';
import { amountOf, orderOf, propertyAmountOf, whereOf } from './criteria.js';
import { toBill } from './mapper.js';

const groupBy = (rows, key) => {
  const out = new Map();
  for (const r of rows) out.set(r[key], [...(out.get(r[key]) || []), r]);
  return out;
};

// Bill rows → full bill objects (line items, allocations, history, people), in one query per part
async function hydrate(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [lines, allocations, history] = await Promise.all([
    db.select().from(billLineItems).where(inArray(billLineItems.billId, ids)).orderBy(asc(billLineItems.position)),
    db.select().from(billAllocations).where(inArray(billAllocations.billId, ids)).orderBy(asc(billAllocations.position)),
    db.select().from(billHistory).where(inArray(billHistory.billId, ids)).orderBy(asc(billHistory.at), asc(billHistory.id)),
  ]);
  const personIds = new Set();
  for (const r of rows) [r.ownerId, r.createdBy, r.approverId].forEach((id) => id && personIds.add(id));
  for (const a of allocations) if (a.pmId) personIds.add(a.pmId);
  const people = new Map();
  if (personIds.size) {
    const found = await db
      .select({ id: users.id, name: users.name, role: users.role, location_name: users.locationName, source_of_supply: users.sourceOfSupply })
      .from(users)
      .where(inArray(users.id, [...personIds]));
    for (const p of found) people.set(p.id, p);
  }
  const linesBy = groupBy(lines, 'billId');
  const allocBy = groupBy(allocations, 'billId');
  const historyBy = groupBy(history, 'billId');
  return rows.map((r) =>
    toBill(r, { lineItems: linesBy.get(r.id), allocations: allocBy.get(r.id), history: historyBy.get(r.id), people }),
  );
}

export async function findById(id) {
  if (!isUuid(id)) return null;
  const rows = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  return (await hydrate(rows))[0] || null;
}

// The bill only if it matches the criteria (e.g. visible to the user)
export async function findOne(id, criteria) {
  if (!isUuid(id)) return null;
  const rows = await db.select().from(bills).where(and(eq(bills.id, id), whereOf(criteria))).limit(1);
  return (await hydrate(rows))[0] || null;
}

// One page of bills + the total count. Each bill gets `amount` (the viewer's amount).
export async function findPage(criteria, { sort, page = 1, pageSize = 25 } = {}) {
  const where = whereOf(criteria);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ bill: bills, amount: amountOf(criteria) })
      .from(bills)
      .where(where)
      .orderBy(...orderOf(criteria, sort))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(bills).where(where),
  ]);
  const full = await hydrate(rows.map((r) => r.bill));
  return { rows: full.map((b, i) => ({ ...b, amount: Number(rows[i].amount) })), total: n };
}

// Count + amount per status / stage
export async function totals(criteria) {
  const amount = amountOf(criteria);
  return db
    .select({ status: bills.status, stage: bills.stage, count: count(), amount: sql`coalesce(sum(${amount}), 0)`.mapWith(Number) })
    .from(bills)
    .where(whereOf(criteria))
    .groupBy(bills.status, bills.stage);
}

// Count + amount per property (PM) and status. Bills nobody is assigned to yet → pmId null.
export function totalsByProperty(criteria) {
  return db
    .select({
      pmId: billAllocations.pmId,
      name: users.name,
      location_name: users.locationName,
      source_of_supply: users.sourceOfSupply,
      status: bills.status,
      count: sql`count(distinct ${bills.id})`.mapWith(Number),
      amount: sql`coalesce(sum(coalesce(${billAllocations.amount}, ${bills.total})), 0)`.mapWith(Number),
    })
    .from(bills)
    .leftJoin(billAllocations, eq(billAllocations.billId, bills.id))
    .leftJoin(users, eq(users.id, billAllocations.pmId))
    .where(whereOf(criteria))
    .groupBy(billAllocations.pmId, users.name, users.locationName, users.sourceOfSupply, bills.status);
}

// Count + amount per expense account. Each line's part of the bill is its gross amount
// (qty × rate + tax) out of all the bill's lines, applied to the amount that belongs to the
// property being looked at (its share when a property / PM is filtered, else the bill total).
export async function totalsByAccount(criteria) {
  const gross = sql`${billLineItems.quantity} * ${billLineItems.rate} * (1 + ${billLineItems.taxPercentage} / 100)`;
  const lines = db
    .select({
      billId: billLineItems.billId,
      accountId: billLineItems.accountId,
      part: sql`${gross} / nullif(sum(${gross}) over (partition by ${billLineItems.billId}), 0)`.as('part'),
      amount: sql`${propertyAmountOf(criteria)}`.as('amount'),
    })
    .from(billLineItems)
    .innerJoin(bills, eq(bills.id, billLineItems.billId))
    .where(whereOf(criteria))
    .as('lines');
  return db
    .select({
      accountId: lines.accountId,
      count: sql`count(distinct ${lines.billId})`.mapWith(Number),
      amount: sql`coalesce(round(sum(${lines.part} * ${lines.amount}), 2), 0)`.mapWith(Number),
    })
    .from(lines)
    .groupBy(lines.accountId)
    .orderBy(sql`3 desc`);
}

// Another live (pending / posted) bill with the same vendor + bill number
export async function duplicateExists({ id, financeOrgId, vendorId, billNumber }) {
  const rows = await db
    .select({ id: bills.id })
    .from(bills)
    .where(
      and(
        eq(bills.financeOrgId, financeOrgId),
        eq(bills.vendorId, vendorId),
        eq(bills.billNumber, billNumber),
        inArray(bills.status, ['PENDING', 'POSTED']),
        id ? sql`${bills.id} <> ${id}` : sql`true`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// What is still assigned to a user (must be zero before deleting them or changing their role)
export async function workloadOf(userId) {
  const one = async (where) => (await db.select({ n: count() }).from(bills).where(where))[0].n;
  const open = sql`${bills.status} <> 'POSTED'`;
  const [approvals, owned, allocated] = await Promise.all([
    one(and(eq(bills.approverId, userId), eq(bills.status, 'PENDING'))),
    one(and(eq(bills.ownerId, userId), open)),
    one(and(open, sql`exists (select 1 from ${billAllocations} where ${billAllocations.billId} = ${bills.id} and ${billAllocations.pmId} = ${userId})`)),
  ]);
  return { approvals, owned, allocated };
}
