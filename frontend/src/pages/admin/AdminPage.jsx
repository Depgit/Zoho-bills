import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import CreateUserForm from './CreateUserForm.jsx';
import UsersTable from './UsersTable.jsx';
import { useUsers } from './useUsers.js';

// Admin: create users, change role / reporting line / location, transfer workloads, delete
export default function AdminPage() {
  const { users, locations, byRole, managersFor, message, actions } = useUsers();
  return (
    <div>
      <PageHeader
        title="Users & Hierarchy"
        description="Approval chain: Property Manager → Cluster Manager → Operations Manager → Finance Manager → Zoho. Create users top-down (FM first), set who reports to whom, and transfer a manager's workload when they move on."
      />
      <InfoBanner message={message} />
      <CreateUserForm locations={locations} managersFor={managersFor} onCreate={actions.createUser} />
      <UsersTable users={users} byRole={byRole} managersFor={managersFor} locations={locations} actions={actions} />
    </div>
  );
}
