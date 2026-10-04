import { showError } from '../../api/errors.js';

// Registration step 1: the Admin's name, email and password
export default function AccountStep({ form, set, onNext }) {
  const next = () => {
    if (!form.name || !form.email || !form.password) return showError('Please fill in name, email and password');
    onNext();
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="form-field">
        <label className="form-label">Full Name</label>
        <input className="form-control" placeholder="Admin Name" value={form.name} onChange={set('name')} required />
      </div>
      <div className="form-field">
        <label className="form-label">Email Address</label>
        <input
          className="form-control"
          placeholder="name@company.com"
          type="email"
          value={form.email}
          onChange={set('email')}
          required
        />
      </div>
      <div className="form-field">
        <label className="form-label">Password</label>
        <input
          className="form-control"
          placeholder="Min 8 characters"
          type="password"
          value={form.password}
          onChange={set('password')}
          required
          minLength={8}
        />
      </div>
      <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '0.25rem' }} onClick={next}>
        Next: Zoho Credentials →
      </button>
    </div>
  );
}
