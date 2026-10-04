import Icon from '../common/Icon.jsx';
import { ROLE_NAME, ROLE_TAG_CLASS } from '../../constants/roles.js';

// Top bar: brand on the left, the logged-in user + logout on the right
export default function Navbar({ user, onLogout }) {
  return (
    <nav className="navbar">
      <div className="brand-wrapper">
        <div className="brand-logo-icon">
          <Icon name="logo" size={22} strokeWidth={2.2} />
        </div>
        <div className="brand-info">
          <div className="brand-title">
            BillFlow
            <span className="brand-badge">Zoho Sync</span>
          </div>
          <span className="brand-subtitle">Invoice Approvals &amp; Books Sync</span>
        </div>
      </div>

      <div className="user-nav-actions">
        <div className="user-profile-badge">
          <div className="user-avatar-circle">{user.name ? user.name[0] : 'U'}</div>
          <span className="user-meta-name">{user.name}</span>
          <span className={`role-tag ${ROLE_TAG_CLASS[user.role] || 'role-l1'}`}>{ROLE_NAME[user.role] || user.role}</span>
        </div>
        <button onClick={onLogout} className="btn-logout" title="Sign out of session">
          <Icon name="logout" size={16} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
