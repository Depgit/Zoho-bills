// The role's tabs (Upload / Queue / History / Users)
export default function RoleTabs({ tabs, active, onSelect }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" className={`tab ${active === key ? 'active' : ''}`} aria-current={active === key ? 'page' : undefined} onClick={() => onSelect(key)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
