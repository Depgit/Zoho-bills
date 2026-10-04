import { useState } from 'react';
import ErrorModal from './components/common/ErrorModal.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterOrgPage from './pages/auth/RegisterOrgPage.jsx';
import { clearSession, savedUser } from './utils/session.js';

// Root: login / registration until signed in, then the app. Errors anywhere show in one popup.
export default function App() {
  const [user, setUser] = useState(savedUser);
  const [registering, setRegistering] = useState(false);
  const [welcome, setWelcome] = useState('');

  const logout = () => {
    clearSession();
    setUser(null);
    setRegistering(false);
    setWelcome('');
  };

  const onRegistered = (u, orgName) => {
    setUser(u);
    setWelcome(
      `🎉 Welcome! Your organisation is connected to Zoho org "${orgName}". Create your Finance, Operations, Cluster and Property Managers in Users & Hierarchy.`,
    );
  };

  let page;
  if (user) page = <AppShell user={user} welcome={welcome} onCloseWelcome={() => setWelcome('')} onLogout={logout} />;
  else if (registering) page = <RegisterOrgPage onBack={() => setRegistering(false)} onSuccess={onRegistered} />;
  else page = <LoginPage onLogin={setUser} onRegister={() => setRegistering(true)} />;

  return (
    <>
      {page}
      <ErrorModal />
    </>
  );
}
