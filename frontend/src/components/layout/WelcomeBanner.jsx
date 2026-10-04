// Green strip shown once after an organisation registers
export default function WelcomeBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.08) 0%, rgba(16, 185, 129, 0.05) 100%)',
        borderBottom: '1px solid rgba(16, 185, 129, 0.25)',
        padding: '0.75rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.875rem',
        color: '#065f46',
      }}
    >
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: '1.1rem', lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  );
}
