import React, { useState } from 'react';
import { api, showError } from './api.js';
import ErrorModal from './ErrorModal.jsx';
import { ROLE_NAME } from './billUtils.jsx';
import BillForm from './BillForm.jsx';
import Review from './Review.jsx';
import Admin from './Admin.jsx';
import InvoiceHistory from './InvoiceHistory.jsx';

// ── Organisation registration: creates the one Admin + Zoho connection ─────────
function RegisterOrg({ onBack, onSuccess }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    zohoClientId: '', zohoClientSecret: '', zohoRefreshToken: '', zohoOrgId: '',
    zohoAccountsUrl: 'https://accounts.zoho.in',
    zohoApiUrl: 'https://www.zohoapis.in',
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = account details, 2 = zoho credentials

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onSuccess(data.user, data.zohoOrgName);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-header">
          <div className="auth-icon-badge" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </div>
          <h2 className="auth-title">Register Your Organisation</h2>
          <p className="auth-subtitle">Connect your Zoho Books account to get started</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          {[1, 2].map(s => (
            <React.Fragment key={s}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, cursor: s < step ? 'pointer' : 'default',
                background: step >= s ? 'var(--primary-gradient)' : 'var(--color-surface-subtle)',
                color: step >= s ? '#fff' : 'var(--text-muted)',
                boxShadow: step === s ? 'var(--shadow-md)' : 'none',
                transition: 'all 0.2s ease',
              }} onClick={() => s < step && setStep(s)}>{s}</div>
              {s < 2 && <div style={{ flex: 1, height: 2, background: step > s ? 'var(--primary)' : 'var(--color-border)', borderRadius: 2, transition: 'background 0.3s ease' }} />}
            </React.Fragment>
          ))}
          <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {step === 1 ? 'Account Details' : 'Zoho Credentials'}
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-field">
                <label className="form-label">Full Name</label>
                <input className="form-control" placeholder="Admin Name" value={form.name} onChange={set('name')} required />
              </div>
              <div className="form-field">
                <label className="form-label">Email Address</label>
                <input className="form-control" placeholder="name@company.com" type="email" value={form.email} onChange={set('email')} required />
              </div>
              <div className="form-field">
                <label className="form-label">Password</label>
                <input className="form-control" placeholder="Min 8 characters" type="password" value={form.password} onChange={set('password')} required minLength={8} />
              </div>
              <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '0.25rem' }}
                onClick={() => {
                  if (!form.name || !form.email || !form.password) { showError('Please fill in name, email and password'); return; }
                  setStep(2);
                }}>
                Next: Zoho Credentials →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.75rem 1rem', background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--info-text)', lineHeight: 1.6 }}>
                🔐 These credentials are used to connect to your Zoho Books account. Go to <strong>Zoho API Console → Self Client</strong> to generate them.
              </div>

              <div className="form-field">
                <label className="form-label">Zoho Client ID</label>
                <input className="form-control" placeholder="1000.XXXXXXXXXXXXXXX" value={form.zohoClientId} onChange={set('zohoClientId')} required />
              </div>
              <div className="form-field">
                <label className="form-label">Zoho Client Secret</label>
                <input className="form-control" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" type="password" value={form.zohoClientSecret} onChange={set('zohoClientSecret')} required />
              </div>
              <div className="form-field">
                <label className="form-label">Zoho Refresh Token</label>
                <input className="form-control" placeholder="1000.xxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxx" type="password" value={form.zohoRefreshToken} onChange={set('zohoRefreshToken')} required />
              </div>
              <div className="form-field">
                <label className="form-label">Zoho Org ID</label>
                <input className="form-control" placeholder="60012345678" value={form.zohoOrgId} onChange={set('zohoOrgId')} required />
              </div>

              {/* Advanced: region selector */}
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
                <button type="button" className="btn btn-secondary" style={{ flex: '0 0 auto', padding: '0 1.25rem' }} onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? (
                    <><div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', width: 16, height: 16 }}></div>Verifying &amp; Registering...</>
                  ) : '🔗 Verify Zoho &amp; Register'}
                </button>
              </div>
            </div>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 'inherit' }}>
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
// Errors anywhere in the app show in one popup
export default function App() {
  return (
    <>
      <Shell />
      <ErrorModal />
    </>
  );
}

// Tabs per role. Approvers (CM/OM/FM) also upload; Admin manages users and all bills.
const TABS = {
  PM: [['upload', '📤 Upload Bill'], ['history', '📜 Invoice History']],
  CM: [['queue', '📋 Approval Queue'], ['upload', '📤 Upload Bill'], ['history', '📜 Invoice History']],
  OM: [['queue', '📋 Approval Queue'], ['upload', '📤 Upload Bill'], ['history', '📜 Invoice History']],
  FM: [['queue', '📋 Approval Queue'], ['upload', '📤 Upload Bill (direct to Zoho)'], ['history', '📜 Invoice History']],
  ADMIN: [['users', '👥 Users & Hierarchy'], ['queue', '⏳ All Pending'], ['history', '📜 All Bills']],
};

function Shell() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(null);           // null → first tab of the role
  const [editBillData, setEditBillData] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [welcomeMsg, setWelcomeMsg] = useState('');

  const login = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) { showError('Please enter both email and password'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => { localStorage.clear(); setUser(null); setTab(null); setAuthMode('login'); setWelcomeMsg(''); };

  // ── Organisation registration (creates the Admin) ──
  if (!user && authMode === 'register') {
    return (
      <RegisterOrg
        onBack={() => setAuthMode('login')}
        onSuccess={(u, orgName) => {
          setUser(u);
          setWelcomeMsg(`🎉 Welcome! Your organisation is connected to Zoho org "${orgName}". Create your Finance, Operations, Cluster and Property Managers in Users & Hierarchy.`);
        }}
      />
    );
  }

  // ── Login Screen ──
  if (!user) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon-badge">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <h2 className="auth-title">Bill Flow</h2>
            <p className="auth-subtitle">AI-assisted invoice verification &amp; Zoho Books approval workflow</p>
          </div>

          <form className="auth-form" onSubmit={login}>
            <div className="form-field">
              <label className="form-label">Email Address</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </span>
                <input className="form-control has-icon" placeholder="name@company.com" type="email"
                  value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Password</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input className="form-control has-icon" placeholder="••••••••" type="password"
                  value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%' }} disabled={loading}>
              {loading ? (
                <><div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', width: 16, height: 16 }}></div>Signing in...</>
              ) : 'Sign In to Dashboard'}
            </button>
          </form>

          {/* Register organisation CTA */}
          <div style={{
            marginTop: '1.5rem', padding: '1rem', borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.06) 0%, rgba(16, 185, 129, 0.06) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', fontWeight: 500 }}>
              New organisation? Register as its Admin
            </p>
            <button
              onClick={() => setAuthMode('register')}
              className="btn btn-sm"
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: '#fff', border: 'none', fontWeight: 600, padding: '0.4rem 1.25rem',
                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
              }}
            >
              🏦 Register with Zoho Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const roleClass = user.role === 'PM' ? 'role-pm' : user.role === 'FM' || user.role === 'ADMIN' ? 'role-finance' : 'role-l1';
  const roleDisplay = ROLE_NAME[user.role] || user.role;
  const tabs = TABS[user.role] || [];
  const active = tabs.some(([k]) => k === tab) ? tab : tabs[0]?.[0];
  const go = (k) => { setTab(k); if (k !== 'upload') setEditBillData(null); };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="brand-wrapper">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="brand-info">
            <div className="brand-title">
              BillFlow
              <span className="brand-badge">Zoho Sync</span>
            </div>
            <span className="brand-subtitle">Invoice Approvals &amp; Books Sync</span>
          </div>
        </div>

        {/* User badge + logout */}
        <div className="user-nav-actions">
          <div className="user-profile-badge">
            <div className="user-avatar-circle">{user.name ? user.name[0] : 'U'}</div>
            <span className="user-meta-name">{user.name}</span>
            <span className={`role-tag ${roleClass}`}>{roleDisplay}</span>
          </div>
          <button onClick={logout} className="btn-logout" title="Sign out of session">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </nav>

      {/* Welcome banner for a newly registered Admin */}
      {welcomeMsg && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.08) 0%, rgba(16, 185, 129, 0.05) 100%)',
          borderBottom: '1px solid rgba(16, 185, 129, 0.25)',
          padding: '0.75rem 2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.875rem', color: '#065f46',
        }}>
          <span>{welcomeMsg}</span>
          <button onClick={() => setWelcomeMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Role tabs */}
      <div style={{
        background: 'var(--color-surface-subtle, #f8fafc)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.5rem 2rem',
        display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
      }}>
        {tabs.map(([k, label]) => (
          <button key={k} className={`btn btn-sm ${active === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => go(k)}>
            {label}
          </button>
        ))}
      </div>

      <main className="main-content">
        {active === 'users' && <Admin />}
        {active === 'queue' && <Review role={user.role} />}
        {active === 'upload' && (
          <BillForm
            role={user.role}
            initialEditBill={editBillData}
            onClearInitialEdit={() => setEditBillData(null)}
            onNavigateHistory={() => go('history')}
          />
        )}
        {active === 'history' && (
          <InvoiceHistory
            role={user.role}
            userId={user.id}
            onEditBill={(b) => { setEditBillData(b); setTab('upload'); }}
            onNewEntry={() => { setEditBillData(null); setTab('upload'); }}
          />
        )}
      </main>
    </div>
  );
}
