// "2 report(s) · 1 waiting approval" — what's still assigned to a user
export function workloadText(w) {
  if (!w) return '';
  const parts = [
    w.reports && `${w.reports} report(s)`,
    w.approvals && `${w.approvals} waiting approval`,
    w.owned && `${w.owned} open bill(s) owned`,
    w.allocated && `${w.allocated} open bill(s) assigned`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing assigned';
}

export const locationLabel = (l) => `${l.location_name}${l.state_code ? ` (${l.state_code})` : ''}`;
