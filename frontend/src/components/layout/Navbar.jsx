import Icon from '../common/Icon.jsx';
import { ROLE_NAME } from '../../constants/roles.js';

// Top bar: brand on the left, the logged-in user + sign out on the right
export default function Navbar({ user, onLogout }) {
  return (
    <header className="navbar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="logo" size={18} strokeWidth={2.2} />
        </span>
        <span className="brand-name">BillFlow</span>
        <span className="brand-tag">Zoho Books</span>
      </div>
      <div className="nav-user">
        <span className="avatar" aria-hidden>
          {(user.name || 'U')[0].toUpperCase()}
        </span>
        <span className="nav-user-text">
          <span className="nav-user-name">{user.name}</span>
          <span className="nav-user-role">{ROLE_NAME[user.role] || user.role}</span>
        </span>
        <button type="button" onClick={onLogout} className="icon-btn" title="Sign out">
          <Icon name="logout" size={16} />
        </button>
      </div>
    </header>
  );
}
