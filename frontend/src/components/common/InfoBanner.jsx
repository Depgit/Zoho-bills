import Icon from './Icon.jsx';

// Info / success message strip. Messages starting with ✓ show as success.
export default function InfoBanner({ message, onClose }) {
  if (!message) return null;
  const success = message.startsWith('✓');
  return (
    <div className={`notice ${success ? 'notice-success' : ''}`} role="status">
      <Icon name={success ? 'checkCircle' : 'alertCircle'} size={16} />
      <span>{message}</span>
      {onClose && (
        <button type="button" className="notice-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
