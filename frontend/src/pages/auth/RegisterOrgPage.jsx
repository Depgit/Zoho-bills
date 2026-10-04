import { useState } from 'react';
import { api } from '../../api/client.js';
import { showError } from '../../api/errors.js';
import { saveSession } from '../../utils/session.js';
import Icon from '../../components/common/Icon.jsx';
import AuthCard from './AuthCard.jsx';
import StepIndicator from './StepIndicator.jsx';
import AccountStep from './AccountStep.jsx';
import ZohoCredentialsStep from './ZohoCredentialsStep.jsx';

const EMPTY = {
  name: '',
  email: '',
  password: '',
  zohoClientId: '',
  zohoClientSecret: '',
  zohoRefreshToken: '',
  zohoOrgId: '',
  zohoAccountsUrl: 'https://accounts.zoho.in',
  zohoApiUrl: 'https://www.zohoapis.in',
};

// Organisation registration: creates the org's one Admin + its Zoho connection
export default function RegisterOrgPage({ onBack, onSuccess }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const register = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      saveSession(data);
      onSuccess(data.user, data.zohoOrgName);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      icon={<Icon name="briefcase" size={26} />}
      iconBackground="linear-gradient(135deg, #059669 0%, #10b981 100%)"
      title="Register Your Organisation"
      subtitle="Connect your Zoho Books account to get started"
      maxWidth={520}
    >
      <StepIndicator step={step} labels={['Account Details', 'Zoho Credentials']} onStep={setStep} />
      <form onSubmit={register}>
        {step === 1 && <AccountStep form={form} set={set} onNext={() => setStep(2)} />}
        {step === 2 && <ZohoCredentialsStep form={form} set={set} loading={loading} onBack={() => setStep(1)} />}
      </form>
      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            cursor: 'pointer',
            fontWeight: 600,
            padding: 0,
            fontSize: 'inherit',
          }}
        >
          Sign In
        </button>
      </div>
    </AuthCard>
  );
}
