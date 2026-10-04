// Centered dialog over a dimmed backdrop. Clicking the backdrop calls onClose.
export default function Modal({ onClose, maxWidth, children }) {
  return (
    <div className="history-modal-backdrop" onClick={onClose}>
      <div className="history-modal-content" style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
