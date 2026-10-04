import { useState } from 'react';
import Navbar from './Navbar.jsx';
import RoleTabs from './RoleTabs.jsx';
import WelcomeBanner from './WelcomeBanner.jsx';
import { TABS } from '../../constants/tabs.js';
import AdminPage from '../../pages/admin/AdminPage.jsx';
import ReviewPage from '../../pages/review/ReviewPage.jsx';
import BillFormPage from '../../pages/upload/BillFormPage.jsx';
import HistoryPage from '../../pages/history/HistoryPage.jsx';

// Logged-in layout: navbar, the role's tabs, and the active page
export default function AppShell({ user, welcome, onCloseWelcome, onLogout }) {
  const [tab, setTab] = useState(null); // null → first tab of the role
  const [editBill, setEditBill] = useState(null); // bill opened for editing from history

  const tabs = TABS[user.role] || [];
  const active = tabs.some(([key]) => key === tab) ? tab : tabs[0]?.[0];
  const go = (key) => {
    setTab(key);
    if (key !== 'upload') setEditBill(null);
  };
  const openUpload = (bill) => {
    setEditBill(bill);
    setTab('upload');
  };

  return (
    <div className="app-container">
      <Navbar user={user} onLogout={onLogout} />
      <WelcomeBanner message={welcome} onClose={onCloseWelcome} />
      <RoleTabs tabs={tabs} active={active} onSelect={go} />

      <main className="main-content">
        {active === 'users' && <AdminPage />}
        {active === 'queue' && <ReviewPage role={user.role} />}
        {active === 'upload' && (
          <BillFormPage
            role={user.role}
            initialEditBill={editBill}
            onClearInitialEdit={() => setEditBill(null)}
            onNavigateHistory={() => go('history')}
          />
        )}
        {active === 'history' && (
          <HistoryPage role={user.role} userId={user.id} onEditBill={openUpload} onNewEntry={() => openUpload(null)} />
        )}
      </main>
    </div>
  );
}
