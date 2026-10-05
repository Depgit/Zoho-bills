import { useState } from 'react';
import SearchSelect from '../../components/common/SearchSelect.jsx';
import { ROLE_NAME, STAFF_ROLES } from '../../constants/roles.js';
import UserRow from './UserRow.jsx';

// Every user in the org, filterable by role
export default function UsersTable({ users, byRole, managersFor, locations, actions }) {
  const [roleFilter, setRoleFilter] = useState('ALL');
  const shown = users.filter((u) => roleFilter === 'ALL' || u.role === roleFilter);

  return (
    <div className="card">
      <div
        className="card-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}
      >
        <div className="card-title">
          Users <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{shown.length}</span>
        </div>
        <SearchSelect value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 220 }}>
          <option value="ALL">All roles</option>
          {['ADMIN', ...STAFF_ROLES].map((r) => (
            <option key={r} value={r}>
              {ROLE_NAME[r]}
            </option>
          ))}
        </SearchSelect>
      </div>
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Reports to</th>
              <th>Default location</th>
              <th>Workload</th>
              <th>Transfer workload</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                managers={managersFor(u.role)}
                peers={(byRole[u.role] || []).filter((x) => x.id !== u.id)}
                locations={locations}
                actions={actions}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
