// Everything still assigned to a user — must be empty before deleting them or changing their role
import { billsRepo, usersRepo } from '../../db/index.js';

export async function workload(user) {
  const [reports, bills] = await Promise.all([usersRepo.countReports(user.id), billsRepo.workloadOf(user.id)]);
  return { reports, ...bills };
}

export const hasWork = (w) => Boolean(w.reports || w.approvals || w.owned || w.allocated);

export const describeWork = (w) =>
  [
    w.reports && `${w.reports} people report to them`,
    w.approvals && `${w.approvals} bill(s) wait on their approval`,
    w.owned && `they own ${w.owned} open bill(s)`,
    w.allocated && `${w.allocated} open bill(s) are assigned to them`,
  ]
    .filter(Boolean)
    .join(', ');
