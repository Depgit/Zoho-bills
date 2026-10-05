import SearchSelect from '../../components/common/SearchSelect.jsx';
import { MANAGER_ROLE, ROLE_NAME, STAFF_ROLES, TRANSFER_ROLES } from '../../constants/roles.js';
import { idOf } from '../../utils/ids.js';
import TransferControl from './TransferControl.jsx';
import { locationLabel, workloadText } from './workload.js';

const compact = { fontSize: '0.8125rem', padding: '0.3rem 0.5rem' };
const muted = { color: 'var(--text-muted)', fontSize: '0.8125rem' };

// One user: role, manager and location are edited inline
export default function UserRow({ user, managers, peers, locations, actions }) {
  const isAdmin = user.role === 'ADMIN';
  return (
    <tr>
      <td>
        <strong>{user.name}</strong>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</div>
      </td>

      <td style={{ minWidth: 190 }}>
        {isAdmin ? (
          <span className="badge-status badge-posted">Admin</span>
        ) : (
          <SearchSelect value={user.role} onChange={(e) => actions.changeRole(user, e.target.value)} style={compact}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAME[r]}
              </option>
            ))}
          </SearchSelect>
        )}
      </td>

      <td style={{ minWidth: 180 }}>
        {MANAGER_ROLE[user.role] ? (
          <SearchSelect
            value={idOf(user.managerId)}
            onChange={(e) => actions.changeManager(user, e.target.value)}
            style={{ ...compact, borderColor: !user.managerId ? 'var(--warning, #f59e0b)' : undefined }}
          >
            <option value="">— Not set —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SearchSelect>
        ) : (
          <span style={muted}>{isAdmin ? '—' : 'Top of chain'}</span>
        )}
      </td>

      <td style={{ minWidth: 190 }}>
        {isAdmin ? (
          '—'
        ) : (
          <SearchSelect value={user.location_id || ''} onChange={(e) => actions.changeLocation(user, e.target.value)} style={compact}>
            <option value="">{user.role === 'PM' ? '— Select —' : '— None —'}</option>
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {locationLabel(l)}
              </option>
            ))}
          </SearchSelect>
        )}
      </td>

      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', minWidth: 160 }}>
        {isAdmin ? '—' : workloadText(user.workload)}
      </td>

      <td style={{ minWidth: 220 }}>
        {TRANSFER_ROLES.includes(user.role) ? (
          <TransferControl user={user} peers={peers} onTransfer={actions.transfer} />
        ) : (
          <span style={{ ...muted, fontSize: '0.75rem' }}>—</span>
        )}
      </td>

      <td>
        {!isAdmin && (
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => actions.removeUser(user)}
            style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}
