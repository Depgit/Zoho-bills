import React, { useEffect, useState } from 'react';
import { api, errMsg } from './api.js';

const blank = { name: '', email: '', password: '', role: 'PM', source_of_supply: '', location_id: '', location_name: '' };

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const [u, l] = await Promise.all([
        api.get('/auth/users'),
        api.get('/zoho/locations'),
      ]);
      setUsers(u.data);
      setLocations(l.data);
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      await api.post('/auth/users', form);
      setForm(blank);
      setMsg('User created successfully!');
      load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`Delete user "${name}"?`)) return;
    try {
      await api.delete(`/auth/users/${id}`);
      setMsg(`${name} deleted.`);
      load();
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  const onLocationChange = (loc_id) => {
    const loc = locations.find(l => l.location_id === loc_id);
    setForm(prev => ({ ...prev, location_id: loc_id, location_name: loc?.location_name || '' }));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Administration</h1>
          <p className="page-description">Create and manage Property Manager and L1 Approver accounts.</p>
        </div>
      </div>

      {msg && (
        <div className={msg.includes('success') || msg.includes('deleted') ? 'extracted-banner' : 'error-banner'} style={{ marginBottom: '1.5rem' }}>
          <span>{msg}</span>
        </div>
      )}

      {/* Create User Form */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <div className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            Create New User
          </div>
        </div>

        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', padding: '0 0 0.5rem' }}>
          <div className="form-field">
            <label className="form-label">Full Name *</label>
            <input className="form-control" placeholder="e.g. Ravi Sharma" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Email *</label>
            <input className="form-control" type="email" placeholder="user@company.com" value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Password *</label>
            <input className="form-control" type="password" placeholder="Set a password" value={form.password} onChange={e => set('password', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Role *</label>
            <select className="form-control" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="PM">Property Manager (PM)</option>
              <option value="L1">L1 Approver</option>
            </select>
          </div>

          {form.role === 'PM' && (
            <>
              <div className="form-field">
                <label className="form-label">Source of Supply</label>
                <input
                  className="form-control"
                  placeholder="e.g. DL (State code)"
                  value={form.source_of_supply}
                  onChange={e => set('source_of_supply', e.target.value.toUpperCase())}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Location *</label>
                <select
                  className="form-control"
                  value={form.location_id}
                  onChange={e => onLocationChange(e.target.value)}
                  required={form.role === 'PM'}
                >
                  <option value="">— Select Location —</option>
                  {locations.map(l => (
                    <option key={l.location_id} value={l.location_id}>{l.location_name}</option>
                  ))}
                </select>
                {locations.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Loading locations from Zoho…
                  </p>
                )}
              </div>
            </>
          )}

          <div className="form-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating…' : '+ Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* Existing Users Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Managed Users
            <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{users.length}</span>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="pdf-fallback" style={{ borderRadius: 'var(--radius-md)' }}>
            <p>No PM or L1 users yet. Create one above.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Source of Supply</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id}>
                    <td><strong>{u.name}</strong></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{u.email}</td>
                    <td>
                      <span className={`badge-status ${u.role === 'PM' ? 'badge-pending-l1' : 'badge-pending-finance'}`}>
                        {u.role === 'PM' ? 'Property Manager' : 'L1 Approver'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {u.location_name
                        ? <><strong>{u.location_name}</strong><br /><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.location_id}</span></>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {u.source_of_supply || '—'}
                    </td>
                    <td>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => remove(u._id, u.name)} style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
