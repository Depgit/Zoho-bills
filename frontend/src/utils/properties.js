// "Property" = the PM a bill (or part of it) belongs to, with their location and state
import { getBillTotal } from './billMath.js';
import { idOf } from './ids.js';

const pmProperty = (u = {}) => ({
  key: idOf(u) || 'unknown',
  name: u.location_name || u.name || 'Unknown property',
  pm: u.name || '—',
  state: u.source_of_supply || '',
});

// Each property's share of a bill. A draft with nobody assigned yet → "Unassigned".
export function propertyShares(b) {
  if (b.allocations?.length) return b.allocations.map((a) => ({ ...pmProperty(a.pmId), amount: Number(a.amount) || 0 }));
  return [{ key: 'unassigned', name: 'Unassigned', pm: '—', state: '', amount: getBillTotal(b) }];
}

// One label for a table row: the single PM's property, or "Split · N properties"
export function propertyOf(b) {
  const shares = propertyShares(b);
  if (shares.length === 1) return shares[0];
  return {
    key: 'split',
    name: `Split · ${shares.length} properties`,
    pm: shares.map((p) => p.pm).join(', '),
    state: b.source_of_supply || '',
  };
}

// Per-property summary: bills counted toward each assigned PM with their share
export function summariseProperties(bills) {
  const rows = new Map();
  for (const b of bills) {
    for (const p of propertyShares(b)) {
      const row = rows.get(p.key) || {
        ...p,
        total: 0,
        totalAmt: 0,
        posted: 0,
        postedAmt: 0,
        pending: 0,
        pendingAmt: 0,
        rejected: 0,
      };
      row.total++;
      row.totalAmt += p.amount;
      if (b.status === 'POSTED') {
        row.posted++;
        row.postedAmt += p.amount;
      } else if (b.status === 'PENDING') {
        row.pending++;
        row.pendingAmt += p.amount;
      } else if (b.status === 'REJECTED') {
        row.rejected++;
      }
      rows.set(p.key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.totalAmt - a.totalAmt);
}
