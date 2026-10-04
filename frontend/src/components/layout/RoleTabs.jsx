// The role's tab bar (Upload / Queue / History / Users)
export default function RoleTabs({ tabs, active, onSelect }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-subtle, #f8fafc)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.5rem 2rem',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
      }}
    >
      {tabs.map(([key, label]) => (
        <button key={key} className={`btn btn-sm ${active === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onSelect(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
