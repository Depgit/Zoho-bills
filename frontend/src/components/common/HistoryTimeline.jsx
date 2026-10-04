// A bill's full action log: who did what, with their comment
export default function HistoryTimeline({ history, title, emptyComment = 'No comment' }) {
  if (!history?.length) return null;
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{title}</h4>
      <div className="history-timeline">
        {history.map((h, i) => (
          <div key={i} className="history-item">
            <span className="history-by">{h.by}</span>
            <span className="history-action">[{h.action}]</span>
            <span className="history-comment">{h.comment ? `“${h.comment}”` : emptyComment}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
