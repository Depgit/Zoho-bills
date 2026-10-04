// Reporting lines of the users below me, used to filter history by OM / CM
import { idOf } from './ids.js';

// id → [id, manager id, manager's manager id, ...] within the loaded team
export function buildChain(team) {
  const byId = new Map(team.map((u) => [idOf(u), u]));
  return (id) => {
    const out = [];
    for (let u = byId.get(id); u && !out.includes(idOf(u)); u = byId.get(idOf(u.managerId))) out.push(idOf(u));
    return out;
  };
}

// A bill is in a manager's area if one of its PMs or its owner reports up to them, or it waits on them
export function billInArea(b, managerId, chain) {
  if (idOf(b.approverId) === managerId) return true;
  const people = [...(b.allocations || []).map((a) => idOf(a.pmId)), idOf(b.ownerId)];
  return people.some((id) => chain(id).includes(managerId));
}

// Users of `role`, optionally only those under `underId`
export const membersOf = (team, role, chain, underId) =>
  team.filter((u) => u.role === role && (!underId || chain(idOf(u)).includes(underId)));
