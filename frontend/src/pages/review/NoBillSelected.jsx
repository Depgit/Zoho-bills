import Icon from '../../components/common/Icon.jsx';

export default function NoBillSelected() {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 460,
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--color-surface-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
        }}
      >
        <Icon name="file" size={32} strokeWidth={1.5} />
      </div>
      <h3 style={{ color: 'var(--text-main)', fontSize: '1.15rem', marginBottom: '0.25rem' }}>No Bill Selected</h3>
      <p style={{ maxWidth: 360, fontSize: '0.875rem' }}>
        Select any pending bill from the queue on the left to verify details, inspect the invoice PDF, and approve or reject.
      </p>
    </div>
  );
}
