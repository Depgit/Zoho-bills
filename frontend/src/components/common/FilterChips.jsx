// Removable chips for the filters in use: [Pending ×] [CM: Ravi ×] … Clear all
export default function FilterChips({ chips, onClear }) {
  if (!chips.length) return null;
  return (
    <div className="chips">
      {chips.map((c) => (
        <span key={c.key} className="chip">
          {c.label}
          <button type="button" onClick={c.onRemove} aria-label={`Remove ${c.label}`}>
            ×
          </button>
        </span>
      ))}
      <button type="button" className="chips-clear" onClick={onClear}>
        Clear all
      </button>
    </div>
  );
}
