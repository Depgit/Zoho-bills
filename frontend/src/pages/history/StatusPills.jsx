// Status filter: All / Passed / Pending / Rejected / Drafts, with counts
export default function StatusPills({ value, onChange, kpis: k }) {
  const pills = [
    ['ALL', '', `All Bills (${k.totalCount})`],
    ['POSTED', 'filter-pill-passed', `✓ Passed (${k.passedCount})`],
    ['PENDING', 'filter-pill-pending', `⏳ Pending (${k.pendingCount})`],
    ['REJECTED', 'filter-pill-rejected', `⚠️ Rejected (${k.rejectedCount})`],
    ['DRAFT', '', `📝 Drafts (${k.draftCount})`],
  ];
  return (
    <div className="status-filter-group">
      {pills.map(([key, cls, label]) => (
        <button key={key} type="button" className={`filter-pill ${cls} ${value === key ? 'active' : ''}`} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
