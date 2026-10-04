// Totals for the KPI cards and status pills
export function computeKpis(bills, amountOf) {
  const sum = (list) => list.reduce((s, b) => s + amountOf(b), 0);
  const by = (status) => bills.filter((b) => b.status === status);
  const posted = by('POSTED');
  const pending = by('PENDING');
  const rejected = by('REJECTED');
  const pendingAt = (stage) => pending.filter((b) => b.stage === stage).length;
  return {
    passedAmt: sum(posted),
    passedCount: posted.length,
    pendingAmt: sum(pending),
    pendingCount: pending.length,
    pendingCm: pendingAt('CM'),
    pendingOm: pendingAt('OM'),
    pendingFm: pendingAt('FM'),
    draftCount: by('DRAFT').length,
    rejectedAmt: sum(rejected),
    rejectedCount: rejected.length,
    totalAmt: sum(bills),
    totalCount: bills.length,
  };
}
