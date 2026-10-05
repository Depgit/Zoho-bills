import { useState } from 'react';
import SearchSelect from '../../components/common/SearchSelect.jsx';
import { MANAGER_ROLE, ROLE_NAME, STAFF_ROLES } from '../../constants/roles.js';
import { locationLabel } from './workload.js';

const BLANK = { name: '', email: '', password: '', role: 'PM', managerId: '', location_id: '' };

// Create a PM / CM / OM / FM: who they report to, and their default location
export default function CreateUserForm({ locations, managersFor, onCreate }) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value, ...(key === 'role' ? { managerId: '' } : {}) }));
  const managerRole = MANAGER_ROLE[form.role];
  const managers = managersFor(form.role);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (await onCreate(form)) setForm(BLANK);
    setSaving(false);
  };

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div className="card-header">
        <div className="card-title">Create New User</div>
      </div>
      <form
        onSubmit={submit}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', padding: '0 0 0.5rem' }}
      >
        <div className="form-field">
          <label className="form-label">Full Name *</label>
          <input className="form-control" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label">Email *</label>
          <input className="form-control" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label">Password *</label>
          <input className="form-control" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label">Role *</label>
          <SearchSelect value={form.role} onChange={(e) => set('role', e.target.value)}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAME[r]} ({r})
              </option>
            ))}
          </SearchSelect>
        </div>

        {managerRole && (
          <div className="form-field">
            <label className="form-label">Reports to ({managerRole}) *</label>
            <SearchSelect value={form.managerId} onChange={(e) => set('managerId', e.target.value)} required>
              <option value="">— Select {ROLE_NAME[managerRole]} —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SearchSelect>
            {managers.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--warning, #f59e0b)', marginTop: '0.3rem' }}>
                Create a {ROLE_NAME[managerRole]} first.
              </p>
            )}
          </div>
        )}

        <div className="form-field">
          <label className="form-label">Default location {form.role === 'PM' ? '*' : '(optional)'}</label>
          <SearchSelect value={form.location_id} onChange={(e) => set('location_id', e.target.value)} required={form.role === 'PM'}>
            <option value="">— Select Location —</option>
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {locationLabel(l)}
              </option>
            ))}
          </SearchSelect>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Preselected on their bills. State {locations.find((l) => l.location_id === form.location_id)?.state_code || '—'}{' '}
            decides GST vs IGST.
          </p>
        </div>

        <div className="form-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Creating…' : '+ Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}
