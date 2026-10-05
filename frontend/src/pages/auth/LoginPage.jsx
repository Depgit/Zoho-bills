import { useState } from 'react';
import { login as signIn } from '../../api/auth.js';
import { showError } from '../../api/errors.js';
import { saveSession } from '../../utils/session.js';
import Icon from '../../components/common/Icon.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import AuthCard from './AuthCard.jsx';
import IconInput from './IconInput.jsx';
import RegisterCta from './RegisterCta.jsx';

export default function LoginPage({ onLogin, onRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (e) => {
    e.preventDefault();
    if (!email || !password) return showError('Please enter both email and password');
    setLoading(true);
    try {
      const data = await signIn(email, password);
      saveSession(data);
      onLogin(data.user);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      icon={<Icon name="logo" size={26} />}
      title="Bill Flow"
      subtitle="AI-assisted invoice verification & Zoho Books approval workflow"
    >
      <form className="auth-form" onSubmit={login}>
        <IconInput
          label="Email Address"
          icon="mail"
          placeholder="name@company.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <IconInput
          label="Password"
          icon="lock"
          placeholder="••••••••"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%' }} disabled={loading}>
          {loading ? (
            <>
              <Spinner light />
              Signing in...
            </>
          ) : (
            'Sign In to Dashboard'
          )}
        </button>
      </form>
      <RegisterCta onClick={onRegister} />
    </AuthCard>
  );
}
