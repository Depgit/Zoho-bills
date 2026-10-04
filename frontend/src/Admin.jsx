import React, { useEffect, useMemo, useState } from 'react';
import { api, showError } from './api.js';
import SearchSelect from './SearchSelect.jsx';
import { ROLE_NAME, MANAGER_ROLE, idOf } from './billUtils.jsx';

// Admin: create users, change role / reporting line / location, transfer workloads, delete.
const STAFF = ['PM', 'CM', 'OM', 'FM'];
const TRANSFERABLE = ['CM', 'OM', 'FM'];
const blank = { name: '', email: '', password: '', role: 'PM', managerId: '', location_id: '' };

const workText = w => {
  if (!w) return '';
  const parts = [
    w.reports && `${w.reports} report(s)`,
    w.approvals && `${w.approvals} waiting approval`,
    w.owned && `${w.owned} open bill(s) owned`,
    w.allocated && `${w.allocated} open bill(s) assigned`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing assigned';
};

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [transferTo, setTransferTo] = useState({});   // userId → target userId
  const [roleFilter, setRoleFilter] = useState('ALL');

  const load = async () => {
    try {
      const [u, l] = await Promise.all([api.get('/admin/users'), api.get('/zoho/locations')]);
      setUsers(u.data);
      setLocations(l.data);
    } catch (e) {
      showError(e);
    }
  };
  useEffect(() => { load(); }, []);

  const byRole = useMemo(() => Object.fromEntries(STAFF.map(r => [r, users.filter(u => u.role === r)])), [users]);
  const managersFor = role => byRole[MANAGER_ROLE[role]] || [];
  const locLabel = l => `${l.location_name}${l.state_code ? ` (${l.state_code})` : ''}`;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v, ...(k === 'role' ? { managerId: '' } : {}) }));

  const run = async (fn, okMsg) => {
    setMsg('');
    try {
      const out = await fn();
      setMsg(typeof okMsg === 'function' ? okMsg(out?.data) : okMsg);
      await load();
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  };

  const create = async e => {
    e.preventDefault();
    setLoading(true);
    if (await run(() => api.post('/admin/users', form), `✓ ${form.name} created as ${ROLE_NAME[form.role]}.`)) setForm(blank);
    setLoading(false);
  };

  const update = (u, patch, label) => run(() => api.patch(`/admin/users/${u._id}`, patch),
    d => `✓ ${u.name}: ${label}${d?.movedBills ? ` — ${d.movedBills} pending bill(s) moved to the new manager` : ''}.`);

  const changeRole = u => role => {
    if (role === u.role) return;
    // a new role usually needs a new manager — pick the first valid one, Admin can change it after
    const mgr = managersFor(role)[0];
    if (MANAGER_ROLE[role] && !mgr) return showError(`Create a ${ROLE_NAME[MANAGER_ROLE[role]]} first — a ${ROLE_NAME[role]} must report to one.`);
    update(u, { role, managerId: mgr?._id || null }, `role changed to ${ROLE_NAME[role]}${mgr ? `, now reports to ${mgr.name}` : ''}`);
  };

  const transfer = u => {
    const to = users.find(x => x._id === transferTo[u._id]);
    if (!to) return showError(`Pick the ${ROLE_NAME[u.role]} to transfer ${u.name}'s workload to.`);
    if (!window.confirm(`Move everything assigned to ${u.name} to ${to.name}?\n\n• Bills waiting on ${u.name}'s approval\n• People reporting to ${u.name}\n• Bills ${u.name} owns or uploaded\n\n${u.name} will have nothing left assigned.`)) return;
    run(() => api.post(`/admin/users/${u._id}/transfer`, { toUserId: to._id }),
      d => `✓ Transferred to ${to.name}: ${d.approvals} pending approval(s), ${d.reports} report(s), ${d.bills} bill(s). ${u.name} now has nothing assigned.`);
  };

  const remove = u => {
    if (!window.confirm(`Delete ${ROLE_NAME[u.role]} "${u.name}"?`)) return;
    run(() => api.delete(`/admin/users/${u._id}`), `✓ ${u.name} deleted.`);
  };

  const shown = users.filter(u => roleFilter === 'ALL' || u.role === roleFilter);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users &amp; Hierarchy</h1>
          <p className="page-description">
            Approval chain: Property Manager → Cluster Manager → Operations Manager → Finance Manager → Zoho.
            Create users top-down (FM first), set who reports to whom, and transfer a manager's workload when they move on.
          </p>
        </div>
      </div>

      {msg && <div className="extracted-banner" style={{ marginBottom: '1.5rem' }}><span>{msg}</span></div>}

      {/* Create user */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header"><div className="card-title">Create New User</div></div>
        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', padding: '0 0 0.5rem' }}>
          <div className="form-field">
            <label className="form-label">Full Name *</label>
            <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Email *</label>
            <input className="form-control" type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Password *</label>
            <input className="form-control" type="password" value={form.password} onChange={e => set('password', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Role *</label>
            <SearchSelect value={form.role} onChange={e => set('role', e.target.value)}>
              {STAFF.map(r => <option key={r} value={r}>{ROLE_NAME[r]} ({r})</option>)}
            </SearchSelect>
          </div>
          {MANAGER_ROLE[form.role] && (
            <div className="form-field">
              <label className="form-label">Reports to ({MANAGER_ROLE[form.role]}) *</label>
              <SearchSelect value={form.managerId} onChange={e => set('managerId', e.target.value)} required>
                <option value="">— Select {ROLE_NAME[MANAGER_ROLE[form.role]]} —</option>
                {managersFor(form.role).map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
              </SearchSelect>
              {managersFor(form.role).length === 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--warning, #f59e0b)', marginTop: '0.3rem' }}>
                  Create a {ROLE_NAME[MANAGER_ROLE[form.role]]} first.
                </p>
              )}
            </div>
          )}
          <div className="form-field">
            <label className="form-label">Default location {form.role === 'PM' ? '*' : '(optional)'}</label>
            <SearchSelect value={form.location_id} onChange={e => set('location_id', e.target.value)} required={form.role === 'PM'}>
              <option value="">— Select Location —</option>
              {locations.map(l => <option key={l.location_id} value={l.location_id}>{locLabel(l)}</option>)}
            </SearchSelect>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Preselected on their bills. State {locations.find(l => l.location_id === form.location_id)?.state_code || '—'} decides GST vs IGST.
            </p>
          </div>
          <div className="form-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating…' : '+ Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* Users */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="card-title">
            Users <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{shown.length}</span>
          </div>
          <SearchSelect value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width: 220 }}>
            <option value="ALL">All roles</option>
            {['ADMIN', ...STAFF].map(r => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}
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
              {shown.map(u => {
                const isAdmin = u.role === 'ADMIN';
                const peers = (byRole[u.role] || []).filter(x => x._id !== u._id);
                return (
                  <tr key={u._id}>
                    <td>
                      <strong>{u.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                    </td>
                    <td style={{ minWidth: 190 }}>
                      {isAdmin ? <span className="badge-status badge-posted">Admin</span> : (
                        <SearchSelect value={u.role} onChange={e => changeRole(u)(e.target.value)} style={{ fontSize: '0.8125rem', padding: '0.3rem 0.5rem' }}>
                          {STAFF.map(r => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}
                        </SearchSelect>
                      )}
                    </td>
                    <td style={{ minWidth: 180 }}>
                      {MANAGER_ROLE[u.role] ? (
                        <SearchSelect
                          value={idOf(u.managerId)}
                          onChange={e => update(u, { managerId: e.target.value }, `now reports to ${users.find(x => x._id === e.target.value)?.name}`)}
                          style={{ fontSize: '0.8125rem', padding: '0.3rem 0.5rem', borderColor: !u.managerId ? 'var(--warning, #f59e0b)' : undefined }}
                        >
                          <option value="">— Not set —</option>
                          {managersFor(u.role).map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
                        </SearchSelect>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{isAdmin ? '—' : 'Top of chain'}</span>}
                    </td>
                    <td style={{ minWidth: 190 }}>
                      {isAdmin ? '—' : (
                        <SearchSelect
                          value={u.location_id || ''}
                          onChange={e => update(u, { location_id: e.target.value }, `default location set to ${locations.find(l => l.location_id === e.target.value)?.location_name || 'none'}`)}
                          style={{ fontSize: '0.8125rem', padding: '0.3rem 0.5rem' }}
                        >
                          <option value="">{u.role === 'PM' ? '— Select —' : '— None —'}</option>
                          {locations.map(l => <option key={l.location_id} value={l.location_id}>{locLabel(l)}</option>)}
                        </SearchSelect>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', minWidth: 160 }}>{isAdmin ? '—' : workText(u.workload)}</td>
                    <td style={{ minWidth: 220 }}>
                      {TRANSFERABLE.includes(u.role) ? (
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <SearchSelect
                            value={transferTo[u._id] || ''}
                            onChange={e => setTransferTo(prev => ({ ...prev, [u._id]: e.target.value }))}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.4rem' }}
                          >
                            <option value="">To {u.role}…</option>
                            {peers.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                          </SearchSelect>
                          <button className="btn btn-secondary btn-sm" onClick={() => transfer(u)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            Move all
                          </button>
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
                    </td>
                    <td>
                      {!isAdmin && (
                        <button className="btn btn-outline-danger btn-sm" onClick={() => remove(u)} style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
