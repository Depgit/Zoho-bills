// GET /bills query string → validated search criteria + sort + page
//   status=PENDING,REJECTED  stage=CM,OM  from=2026-01-01  to=2026-03-31  q=text
//   pmId=<uuid|unassigned>  managerId=<uuid>  ownerId  vendorId  accountId  minAmt  maxAmt  hasZohoError=1
//   pendingOnMe=1 → only bills waiting on my approval (Admin: every pending bill)
//   sort=date:desc (date | amount | billNumber | vendor | status | updated)  page=1  pageSize=25
import { usersRepo } from '../../db/index.js';
import { httpError } from '../../utils/httpError.js';

const STATUSES = ['DRAFT', 'PENDING', 'REJECTED', 'POSTED'];
const STAGES = ['CM', 'OM', 'FM'];
const SORT_FIELDS = ['date', 'amount', 'billNumber', 'vendor', 'status', 'updated'];
const PAGE_SIZES = [10, 25, 50, 100];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const list = (v, allowed) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => allowed.includes(s));

const day = (v, name) => {
  if (!v) return undefined;
  if (!DAY.test(v)) throw httpError(400, `${name} must be a date like 2026-01-31`);
  return v;
};

const amount = (v) => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw httpError(400, 'Amounts must be numbers');
  return n;
};

// Bills in a manager's area: their PMs' bills, bills owned by anyone below them, or waiting on them
async function areaOf(managerId, financeOrgId) {
  const manager = await usersRepo.findInOrg(managerId, financeOrgId);
  if (!manager) throw httpError(400, 'Unknown manager in the filter');
  return { userIds: [manager.id, ...(await usersRepo.idsBelow(manager.id))], approverId: manager.id };
}

// Bills waiting on the user's approval (Admin: on anyone)
export const pendingOn = (user) => ({ statuses: ['PENDING'], ...(user.role === 'ADMIN' ? {} : { approverId: user.id }) });

// → { filters (criteria to AND with the scope), sort, page, pageSize }
export async function parseFilters(query, user) {
  const [field, dir] = String(query.sort || 'updated:desc').split(':');
  const filters = {
    statuses: list(query.status, STATUSES),
    stages: list(query.stage, STAGES),
    from: day(query.from, 'From'),
    to: day(query.to, 'To'),
    q: String(query.q || '').trim().slice(0, 100) || undefined,
    pmId: query.pmId || undefined,
    ownerId: query.ownerId || undefined,
    vendorId: query.vendorId || undefined,
    accountId: query.accountId || undefined,
    minAmount: amount(query.minAmt),
    maxAmount: amount(query.maxAmt),
    hasZohoError: /^(1|true)$/.test(query.hasZohoError || ''),
    ...(query.managerId ? { area: await areaOf(query.managerId, user.financeOrgId) } : {}),
  };
  if (/^(1|true)$/.test(query.pendingOnMe || '')) Object.assign(filters, pendingOn(user));
  const pageSize = PAGE_SIZES.includes(Number(query.pageSize)) ? Number(query.pageSize) : 25;
  return {
    filters,
    sort: { field: SORT_FIELDS.includes(field) ? field : 'updated', dir: dir === 'asc' ? 'asc' : 'desc' },
    page: Math.max(1, Math.floor(Number(query.page)) || 1),
    pageSize,
  };
}
