// Bill lists for the UI: a filtered page, totals for the KPI cards / status pills, totals per property
import { billsRepo } from '../../db/index.js';
import { parseFilters, pendingOn } from './filters.js';
import { withTaxInfo } from './present.js';
import { scopeCriteria } from './visibility.js';

// A PM sees their own share of each bill; everyone else the bill total
const amountView = (user) => (user.role === 'PM' ? { amountForPm: user.id } : {});

async function criteriaFor(user, query) {
  const { filters, sort, page, pageSize } = await parseFilters(query, user);
  const base = await scopeCriteria(user, query.scope);
  // The scope's own conditions win over the same filter from the query (e.g. queue = PENDING only)
  const criteria = { ...amountView(user), ...filters, ...base };
  if (base.statuses && filters.statuses.length) criteria.statuses = base.statuses.filter((s) => filters.statuses.includes(s));
  return { criteria, sort, page, pageSize };
}

// Counts / amounts by status and pending stage
function summarise(rows) {
  const byStatus = { DRAFT: { count: 0, amount: 0 }, PENDING: { count: 0, amount: 0 }, REJECTED: { count: 0, amount: 0 }, POSTED: { count: 0, amount: 0 } };
  const pendingByStage = { CM: 0, OM: 0, FM: 0 };
  let count = 0;
  let total = 0;
  for (const r of rows) {
    byStatus[r.status].count += r.count;
    byStatus[r.status].amount += r.amount;
    if (r.status === 'PENDING' && r.stage in pendingByStage) pendingByStage[r.stage] += r.count;
    count += r.count;
    total += r.amount;
  }
  return { byStatus, pendingByStage, count, amount: total };
}

const ALL_LIMIT = 10_000; // ?all=1 safety cap

// ?all=1 → every bill of the scope in one response (the app filters / sorts / pages in the browser)
async function allBills(user, query) {
  const { criteria } = await criteriaFor(user, query);
  const { rows, total } = await billsRepo.findPage(criteria, { sort: { field: 'updated', dir: 'desc' }, page: 1, pageSize: ALL_LIMIT });
  return { rows: await withTaxInfo(rows, user.financeOrgId), total, truncated: total > rows.length };
}

export async function listBills(user, query) {
  if (/^(1|true)$/.test(query.all || '')) return allBills(user, query);
  const { criteria, sort, page, pageSize } = await criteriaFor(user, query);
  // Totals ignore the status / stage filters (they ARE the status breakdown) — except the queue, which is pending only
  const isQueue = !query.scope || query.scope === 'queue';
  const { approverId, ...rest } = criteria; // the "pending on me" toggle is a status filter too
  const withoutStatus = { ...rest, ...(isQueue ? { approverId } : {}), statuses: isQueue ? criteria.statuses : [], stages: [] };
  const approver = user.role !== 'PM';
  const [{ rows, total }, totals, onMe] = await Promise.all([
    billsRepo.findPage(criteria, { sort, page, pageSize }),
    billsRepo.totals(withoutStatus),
    approver ? billsRepo.totals({ ...withoutStatus, ...pendingOn(user) }) : [],
  ]);
  const summary = summarise(totals);
  if (approver) summary.pendingOnMe = onMe.reduce((s, r) => s + r.count, 0);
  return { rows: await withTaxInfo(rows, user.financeOrgId), total, page, pageSize, summary };
}

// Totals per expense account for the same filters (ignores the status filter, like the summary)
export async function expenseTotals(user, query) {
  const { criteria } = await criteriaFor(user, { ...query, status: undefined, stage: undefined, pendingOnMe: undefined });
  return billsRepo.totalsByAccount(criteria);
}

// One row per property (PM) with counts / amounts per status — ignores the property and status filters
export async function propertyTotals(user, query) {
  const { criteria } = await criteriaFor(user, { ...query, pmId: undefined, status: undefined, stage: undefined, pendingOnMe: undefined });
  const rows = new Map();
  for (const r of await billsRepo.totalsByProperty(criteria)) {
    const key = r.pmId || 'unassigned';
    const row = rows.get(key) || {
      key,
      name: r.pmId ? r.location_name || r.name || 'Unknown property' : 'Unassigned',
      pm: r.name || '—',
      state: r.source_of_supply || '',
      total: 0,
      totalAmt: 0,
      posted: 0,
      postedAmt: 0,
      pending: 0,
      pendingAmt: 0,
      rejected: 0,
      draft: 0,
    };
    row.total += r.count;
    row.totalAmt += r.amount;
    if (r.status === 'POSTED') (row.posted += r.count), (row.postedAmt += r.amount);
    else if (r.status === 'PENDING') (row.pending += r.count), (row.pendingAmt += r.amount);
    else if (r.status === 'REJECTED') row.rejected += r.count;
    else row.draft += r.count;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.totalAmt - a.totalAmt);
}
