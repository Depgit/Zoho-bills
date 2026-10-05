// Filtering, sorting, paging and totals for bill lists — all in the browser, on the cached list.
// Same rules as the server: each bill's `amount` is the viewer's amount (a PM's share, else the total).
import { buildChain } from './team.js';

const STATUSES = ['DRAFT', 'PENDING', 'REJECTED', 'POSTED'];

// Bill date, or the day it was created (drafts without a date)
export const billDay = (b) => b.date || (b.createdAt ? String(b.createdAt).slice(0, 10) : '');

// Everyone in a manager's area (the manager + everyone below them), from the team list
export function areaOf(team, managerId) {
  if (!managerId) return null;
  const chain = buildChain(team);
  return new Set([managerId, ...team.filter((u) => chain(u.id).includes(managerId)).map((u) => u.id)]);
}

const pmIds = (b) => (b.allocations || []).map((a) => a.pmId).filter(Boolean);
const shareOf = (b, pmId) => (b.allocations || []).filter((a) => a.pmId === pmId).reduce((s, a) => s + Number(a.amount || 0), 0);

function textOf(b) {
  return [
    b.billNumber,
    b.vendorName,
    ...(b.allocations || []).flatMap((a) => [a.pm?.name, a.pm?.location_name]),
    ...(b.history || []).map((h) => h.comment),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// One filter function from the filter state. `skip` leaves some filters out (for totals):
//   'status' → status, stage and pending-on-me;  'property' → the property filter
export function makeFilter(f, { userId, role, area }, skip = []) {
  const q = (f.q || '').trim().toLowerCase();
  const min = f.minAmt === '' || f.minAmt == null ? null : Number(f.minAmt);
  const max = f.maxAmt === '' || f.maxAmt == null ? null : Number(f.maxAmt);
  const noStatus = skip.includes('status');
  const noProperty = skip.includes('property');
  return (b) => {
    if (!noStatus) {
      if (f.pendingOnMe && !(b.status === 'PENDING' && (role === 'ADMIN' || b.approverId === userId))) return false;
      if (f.status && b.status !== f.status) return false;
      if (f.status === 'PENDING' && f.stage && b.stage !== f.stage) return false;
    }
    const day = billDay(b);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (area && !(pmIds(b).some((id) => area.has(id)) || area.has(b.ownerId) || b.approverId === (f.cm || f.om))) return false;
    if (!noProperty && f.pmId) {
      if (f.pmId === 'unassigned' ? pmIds(b).length : !pmIds(b).includes(f.pmId)) return false;
    }
    if (f.accountId && !(b.lineItems || []).some((l) => l.account_id === f.accountId)) return false;
    if (min != null && !(b.amount >= min)) return false;
    if (max != null && !(b.amount <= max)) return false;
    if (f.zohoError && !b.zohoError) return false;
    if (q && !textOf(b).includes(q)) return false;
    return true;
  };
}

const SORTERS = {
  date: (a, b) => billDay(a).localeCompare(billDay(b)),
  amount: (a, b) => a.amount - b.amount,
  billNumber: (a, b) => String(a.billNumber).localeCompare(String(b.billNumber), undefined, { numeric: true }),
  vendor: (a, b) => String(a.vendorName).localeCompare(String(b.vendorName)),
  status: (a, b) => a.status.localeCompare(b.status),
  updated: (a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)),
};

// "date:desc" → sorted copy (ties: most recently updated first)
export function sortBills(rows, sort = 'updated:desc') {
  const [field, dir] = sort.split(':');
  const cmp = SORTERS[field] || SORTERS.updated;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * cmp(a, b) || SORTERS.updated(b, a));
}

export function paginate(rows, page, pageSize) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((p - 1) * pageSize, p * pageSize), total: rows.length, page: p, pageSize };
}

// Counts / amounts per status, pending per stage, and (approvers) pending on me
export function summarise(rows, { userId, role }) {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, { count: 0, amount: 0 }]));
  const pendingByStage = { CM: 0, OM: 0, FM: 0 };
  let amount = 0;
  let onMe = 0;
  for (const b of rows) {
    byStatus[b.status].count++;
    byStatus[b.status].amount += b.amount;
    amount += b.amount;
    if (b.status === 'PENDING') {
      if (b.stage in pendingByStage) pendingByStage[b.stage]++;
      if (role === 'ADMIN' || b.approverId === userId) onMe++;
    }
  }
  return { byStatus, pendingByStage, count: rows.length, amount, ...(role !== 'PM' ? { pendingOnMe: onMe } : {}) };
}

// One row per property (PM) with counts / amounts per status
export function propertyTotals(rows) {
  const out = new Map();
  const add = (key, info, status, amount) => {
    const r =
      out.get(key) ||
      out.set(key, { key, ...info, total: 0, totalAmt: 0, posted: 0, postedAmt: 0, pending: 0, pendingAmt: 0, rejected: 0, draft: 0 }).get(key);
    r.total++;
    r.totalAmt += amount;
    if (status === 'POSTED') (r.posted++, (r.postedAmt += amount));
    else if (status === 'PENDING') (r.pending++, (r.pendingAmt += amount));
    else if (status === 'REJECTED') r.rejected++;
    else r.draft++;
  };
  for (const b of rows) {
    const allocations = (b.allocations || []).filter((a) => a.pmId);
    if (!allocations.length) add('unassigned', { name: 'Unassigned', pm: '—', state: '' }, b.status, b.amount);
    for (const a of allocations) {
      const info = { name: a.pm?.location_name || a.pm?.name || 'Unknown property', pm: a.pm?.name || '—', state: a.pm?.source_of_supply || '' };
      add(a.pmId, info, b.status, Number(a.amount) || 0);
    }
  }
  return [...out.values()].sort((a, b) => b.totalAmt - a.totalAmt);
}

// Spend per expense account: each line's part of the bill (qty × rate + tax, out of all lines)
// applied to the amount that belongs to the property in view (its share when one is picked)
export function expenseTotals(rows, pmId) {
  const out = new Map();
  for (const b of rows) {
    const base = pmId && pmId !== 'unassigned' ? shareOf(b, pmId) : b.amount;
    const lines = b.lineItems || [];
    const gross = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.rate) || 0) * (1 + (Number(l.tax_percentage) || 0) / 100));
    const sum = gross.reduce((s, g) => s + g, 0);
    const seen = new Set();
    lines.forEach((l, i) => {
      const id = l.account_id || '';
      const r = out.get(id) || out.set(id, { accountId: id, count: 0, amount: 0 }).get(id);
      if (!seen.has(id)) (r.count++, seen.add(id));
      r.amount += sum ? (gross[i] / sum) * base : 0;
    });
  }
  return [...out.values()].map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}
