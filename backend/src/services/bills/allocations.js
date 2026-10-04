// Which PM(s) a bill belongs to, and how much each.
//   PM owner → always just themselves, for the full total.
//   CM/OM/FM owner → must pick PMs below them; amounts must add up to the total when submitting.
import { httpError } from '../../utils/httpError.js';
import { assignablePms } from '../hierarchy.service.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export async function resolveAllocations(owner, wanted, total, submitting) {
  if (owner.role === 'PM') return [{ pmId: owner._id, amount: total }];

  const list = (Array.isArray(wanted) ? wanted : []).filter((a) => a && a.pmId);
  if (submitting && !list.length) throw httpError(400, 'Choose which Property Manager(s) this bill belongs to');

  const ids = list.map((a) => String(a.pmId));
  if (new Set(ids).size !== ids.length) throw httpError(400, 'Each Property Manager can appear only once');

  const allowed = new Set((await assignablePms(owner)).map((u) => String(u._id)));
  if (ids.some((id) => !allowed.has(id))) {
    throw httpError(400, 'You can only assign bills to Property Managers in your reporting line');
  }
  if (list.some((a) => !(Number(a.amount) > 0))) {
    throw httpError(400, 'Every Property Manager needs an amount greater than 0');
  }

  const sum = list.reduce((s, a) => s + Number(a.amount), 0);
  if (submitting && Math.abs(sum - total) > 1) {
    throw httpError(400, `Assigned amounts add up to ₹${sum.toFixed(2)} but the bill total is ₹${total.toFixed(2)}`);
  }
  return list.map((a) => ({ pmId: a.pmId, amount: round2(a.amount) }));
}
