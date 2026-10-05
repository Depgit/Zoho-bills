// Green strip shown once after an organisation registers
export default function WelcomeBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="strip strip-success">
      <span>{message}</span>
      <button type="button" className="notice-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
