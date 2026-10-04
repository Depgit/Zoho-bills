import Icon from '../../components/common/Icon.jsx';

// No bills to show: either filters hide everything, or nothing was uploaded yet
export default function EmptyHistory({ filtered, canUpload, onReset, onNewEntry }) {
  return (
    <div className="pdf-fallback" style={{ borderRadius: 'var(--radius-md)', padding: '3.5rem 1.5rem' }}>
      <Icon name="alertCircle" size={44} strokeWidth={1.5} style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }} />
      <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>No Invoices Found</h3>
      <p style={{ maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
        {filtered
          ? 'No bills match your current filters. Try changing or resetting the date or status filters.'
          : canUpload
            ? 'You have not uploaded any bills yet. Click below to submit your first invoice.'
            : 'No bills have been submitted yet.'}
      </p>
      {filtered ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
          Clear Filters
        </button>
      ) : (
        canUpload && (
          <button type="button" className="btn btn-primary" onClick={onNewEntry}>
            + Upload New Bill
          </button>
        )
      )}
    </div>
  );
}
