// Page title + description on the left, action buttons on the right
export default function PageHeader({ title, description, children, style }) {
  return (
    <div className="page-header" style={style}>
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>{children}</div>}
    </div>
  );
}
