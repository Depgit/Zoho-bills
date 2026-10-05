import { inr } from '../../utils/format.js';

// Small totals row; clicking a tile filters by that status. Totals follow every filter except status.
// Approvers (and the Admin) also get "Pending on me": bills waiting on their decision.
export default function StatTiles({ summary, status, pendingOnMe, onStatus, onPendingOnMe }) {
  if (!summary) return <div className="stat-tiles skeleton" />;
  const s = summary.byStatus;
  const p = summary.pendingByStage;
  const tiles = [
    ['', 'All bills', summary.count, summary.amount, null],
    ['POSTED', 'Posted to Zoho', s.POSTED.count, s.POSTED.amount, null],
    ['PENDING', 'Pending', s.PENDING.count, s.PENDING.amount, `CM ${p.CM} · OM ${p.OM} · FM ${p.FM}`],
    ['REJECTED', 'Rejected', s.REJECTED.count, s.REJECTED.amount, 'Back with the uploader'],
    ['DRAFT', 'Drafts', s.DRAFT.count, s.DRAFT.amount, null],
  ];
  const hasOnMe = summary.pendingOnMe !== undefined;
  return (
    <div className={`stat-tiles ${hasOnMe ? 'with-on-me' : ''}`}>
      {hasOnMe && (
        <button type="button" className={`stat-tile tone-onme ${pendingOnMe ? 'active' : ''}`} onClick={() => onPendingOnMe(!pendingOnMe)}>
          <span className="stat-label">
            Pending on me <b>{summary.pendingOnMe}</b>
          </span>
          <span className="stat-value">{summary.pendingOnMe ? 'Needs your decision' : 'All clear'}</span>
          <span className="stat-meta">{pendingOnMe ? 'Showing only these' : 'Click to show only these'}</span>
        </button>
      )}
      {tiles.map(([key, label, count, amount, meta]) => (
        <button
          key={label}
          type="button"
          className={`stat-tile tone-${key || 'all'} ${!pendingOnMe && status === key ? 'active' : ''}`}
          onClick={() => onStatus(key)}
        >
          <span className="stat-label">
            {label} <b>{count}</b>
          </span>
          <span className="stat-value">{inr(amount)}</span>
          {meta && <span className="stat-meta">{meta}</span>}
        </button>
      ))}
    </div>
  );
}
