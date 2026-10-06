// How the bill total is spread over the chosen PMs:
//   one PM                  → the whole total
//   equal mode (default)    → equal shares (paise-exact, the last share takes the rounding)
//   manual mode             → amounts as typed; a PM with no amount yet gets what's still unassigned
import { splitEqually } from '../../utils/billMath.js';

const round2 = (n) => Math.round(n * 100) / 100;

export function fillAllocations(list, total, equal) {
  if (!list.length) return list;
  if (list.length === 1) return [{ ...list[0], amount: round2(total) }];
  if (equal) {
    const shares = splitEqually(total, list.length);
    return list.map((a, i) => ({ ...a, amount: shares[i] }));
  }
  const assigned = list.reduce((s, a) => s + (a.amount === '' ? 0 : Number(a.amount) || 0), 0);
  const left = round2(total - assigned);
  return list.map((a) => (a.amount === '' && left > 0 ? { ...a, amount: left } : a));
}
