// Centered card used by the login and registration pages
export default function AuthCard({ icon, iconBackground, title, subtitle, maxWidth, children }) {
  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={maxWidth ? { maxWidth } : undefined}>
        <div className="auth-header">
          <div className="auth-icon-badge" style={iconBackground ? { background: iconBackground } : undefined}>
            {icon}
          </div>
          <h2 className="auth-title">{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
