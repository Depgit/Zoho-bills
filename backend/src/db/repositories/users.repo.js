// Users: lookups, CRUD, and the reporting tree (who is below whom)
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { isUuid } from '../ids.js';
import { users } from '../schema/index.js';

// DB row → user object used by the services
export const toUser = (r) =>
  r && {
    id: r.id,
    financeOrgId: r.financeOrgId,
    name: r.name,
    email: r.email,
    passwordHash: r.passwordHash,
    role: r.role,
    managerId: r.managerId,
    location_id: r.locationId,
    location_name: r.locationName,
    source_of_supply: r.sourceOfSupply,
    createdAt: r.createdAt,
  };

// User object fields → DB columns (only the ones present)
const COLUMNS = {
  financeOrgId: 'financeOrgId',
  name: 'name',
  email: 'email',
  passwordHash: 'passwordHash',
  role: 'role',
  managerId: 'managerId',
  location_id: 'locationId',
  location_name: 'locationName',
  source_of_supply: 'sourceOfSupply',
};
const toRow = (u) => Object.fromEntries(Object.entries(COLUMNS).filter(([k]) => k in u).map(([k, col]) => [col, u[k]]));

const first = async (query) => toUser((await query.limit(1))[0]);

export const findById = (id) => (isUuid(id) ? first(db.select().from(users).where(eq(users.id, id))) : null);

export const findInOrg = (id, financeOrgId) =>
  isUuid(id) && isUuid(financeOrgId)
    ? first(db.select().from(users).where(and(eq(users.id, id), eq(users.financeOrgId, financeOrgId))))
    : null;

export const findByEmail = (email) =>
  first(db.select().from(users).where(eq(sql`lower(${users.email})`, String(email || '').toLowerCase())));

export const emailTaken = async (email) => Boolean(await findByEmail(email));

export async function create(user) {
  const [row] = await db.insert(users).values(toRow(user)).returning();
  return toUser(row);
}

export async function update(id, patch) {
  const [row] = await db.update(users).set(toRow(patch)).where(eq(users.id, id)).returning();
  return toUser(row);
}

export const remove = (id) => db.delete(users).where(eq(users.id, id));

// Everyone in an org (no password hashes), sorted by role then name, with their manager
export async function listByOrg(financeOrgId) {
  const rows = await db.select().from(users).where(eq(users.financeOrgId, financeOrgId)).orderBy(asc(users.role), asc(users.name));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((r) => {
    const { passwordHash, ...u } = toUser(r); // eslint-disable-line no-unused-vars
    const m = byId.get(r.managerId);
    return { ...u, manager: m ? { id: m.id, name: m.name, role: m.role } : null };
  });
}

// Everyone in the org except the Admin
export const staffOfOrg = async (financeOrgId) =>
  (await db.select().from(users).where(and(eq(users.financeOrgId, financeOrgId), ne(users.role, 'ADMIN')))).map(toUser);

// Ids of everyone below `rootId` (direct and indirect reports)
export async function idsBelow(rootId) {
  if (!isUuid(rootId)) return [];
  const { rows } = await db.execute(sql`
    with recursive tree(id) as (
      select id from ${users} where manager_id = ${rootId}
      union
      select u.id from ${users} u join tree t on u.manager_id = t.id
    )
    select id from tree`);
  return rows.map((r) => r.id);
}

// Users below `rootId`, optionally only one role
export async function below(rootId, role) {
  const ids = await idsBelow(rootId);
  if (!ids.length) return [];
  const where = role ? and(inArray(users.id, ids), eq(users.role, role)) : inArray(users.id, ids);
  return (await db.select().from(users).where(where).orderBy(asc(users.name))).map(toUser);
}

export async function countReports(managerId) {
  const [r] = await db.select({ n: count() }).from(users).where(eq(users.managerId, managerId));
  return r.n;
}

// Everyone reporting to `fromId` now reports to `toId`; returns how many moved
export async function moveReports(fromId, toId) {
  const rows = await db.update(users).set({ managerId: toId }).where(eq(users.managerId, fromId)).returning({ id: users.id });
  return rows.length;
}
