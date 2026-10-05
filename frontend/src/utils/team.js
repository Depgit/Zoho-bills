// Reporting lines of the users below me, for the OM / CM filters
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

// Users of `role`, optionally only those under `underId`
export const membersOf = (team, role, chain, underId) =>
  team.filter((u) => u.role === role && (!underId || chain(idOf(u)).includes(underId)));
