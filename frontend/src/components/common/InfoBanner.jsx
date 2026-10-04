import Icon from './Icon.jsx';

// Info / success message strip. Messages starting with ✓ get a check icon.
export default function InfoBanner({ message, onClose, style }) {
  if (!message) return null;
  const success = message.startsWith('✓');
  return (
    <div className="extracted-banner" style={{ marginBottom: '1.5rem', ...style }}>
      <Icon name={success ? 'checkCircle' : 'alertCircle'} size={20} style={success ? { color: 'var(--success)' } : undefined} />
      <span>{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', fontWeight: 'bold' }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
