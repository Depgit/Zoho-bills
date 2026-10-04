import Spinner from '../../components/common/Spinner.jsx';

const FIELDS = [
  ['zohoClientId', 'Zoho Client ID', '1000.XXXXXXXXXXXXXXX', 'text'],
  ['zohoClientSecret', 'Zoho Client Secret', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'password'],
  ['zohoRefreshToken', 'Zoho Refresh Token', '1000.xxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxx', 'password'],
  ['zohoOrgId', 'Zoho Org ID', '60012345678', 'text'],
];

// Registration step 2: Zoho Books API credentials (+ region URLs)
export default function ZohoCredentialsStep({ form, set, loading, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          padding: '0.75rem 1rem',
          background: 'var(--info-bg)',
          border: '1px solid var(--info-border)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.82rem',
          color: 'var(--info-text)',
          lineHeight: 1.6,
        }}
      >
        🔐 These credentials are used to connect to your Zoho Books account. Go to{' '}
        <strong>Zoho API Console → Self Client</strong> to generate them.
      </div>

      {FIELDS.map(([key, label, placeholder, type]) => (
        <div className="form-field" key={key}>
          <label className="form-label">{label}</label>
          <input className="form-control" placeholder={placeholder} type={type} value={form[key]} onChange={set(key)} required />
        </div>
      ))}

      <details style={{ fontSize: '0.82rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none', marginBottom: '0.5rem' }}>
          ⚙ Advanced: Zoho Region (default: India .in)
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
          <div className="form-field">
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Accounts URL</label>
            <input className="form-control" placeholder="https://accounts.zoho.in" value={form.zohoAccountsUrl} onChange={set('zohoAccountsUrl')} />
          </div>
          <div className="form-field">
            <label className="form-label" style={{ fontSize: '0.8rem' }}>API URL</label>
            <input className="form-control" placeholder="https://www.zohoapis.in" value={form.zohoApiUrl} onChange={set('zohoApiUrl')} />
          </div>
        </div>
      </details>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" className="btn btn-secondary" style={{ flex: '0 0 auto', padding: '0 1.25rem' }} onClick={onBack}>
          ← Back
        </button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
          {loading ? (
            <>
              <Spinner light />
              Verifying &amp; Registering...
            </>
          ) : (
            '🔗 Verify Zoho & Register'
          )}
        </button>
      </div>
    </div>
  );
}
