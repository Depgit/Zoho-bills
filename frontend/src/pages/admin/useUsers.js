import { useEffect, useMemo, useState } from 'react';
import * as adminApi from '../../api/admin.js';
import { locations as loadLocations } from '../../api/zoho.js';
import { showError } from '../../api/errors.js';
import { MANAGER_ROLE, ROLE_NAME, STAFF_ROLES } from '../../constants/roles.js';

// Users + Zoho locations for the Admin page, and every Admin action.
// Each action shows a success message, reloads the list, and sends errors to the popup.
export function useUsers() {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [u, l] = await Promise.all([adminApi.listUsers(), loadLocations()]);
      setUsers(u);
      setLocations(l);
    } catch (e) {
      showError(e);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const byRole = useMemo(() => Object.fromEntries(STAFF_ROLES.map((r) => [r, users.filter((u) => u.role === r)])), [users]);
  const managersFor = (role) => byRole[MANAGER_ROLE[role]] || [];
  const nameOf = (id) => users.find((u) => u.id === id)?.name;

  // Run a request; on success show `ok` (string, or function of the response data) and reload
  const run = async (request, ok) => {
    setMessage('');
    try {
      const data = await request();
      setMessage(typeof ok === 'function' ? ok(data) : ok);
      await load();
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  };

  const createUser = (form) => run(() => adminApi.createUser(form), `✓ ${form.name} created as ${ROLE_NAME[form.role]}.`);

  const updateUser = (u, patch, label) =>
    run(
      () => adminApi.updateUser(u.id, patch),
      (d) => `✓ ${u.name}: ${label}${d?.movedBills ? ` — ${d.movedBills} pending bill(s) moved to the new manager` : ''}.`,
    );

  // A new role usually needs a new manager — pick the first valid one; the Admin can change it after
  const changeRole = (u, role) => {
    if (role === u.role) return;
    const manager = managersFor(role)[0];
    if (MANAGER_ROLE[role] && !manager) {
      return showError(`Create a ${ROLE_NAME[MANAGER_ROLE[role]]} first — a ${ROLE_NAME[role]} must report to one.`);
    }
    updateUser(u, { role, managerId: manager?.id || null }, `role changed to ${ROLE_NAME[role]}${manager ? `, now reports to ${manager.name}` : ''}`);
  };

  const changeManager = (u, managerId) => updateUser(u, { managerId }, `now reports to ${nameOf(managerId)}`);

  const changeLocation = (u, locationId) =>
    updateUser(
      u,
      { location_id: locationId },
      `default location set to ${locations.find((l) => l.location_id === locationId)?.location_name || 'none'}`,
    );

  const transfer = (u, toUserId) => {
    const to = users.find((x) => x.id === toUserId);
    if (!to) return showError(`Pick the ${ROLE_NAME[u.role]} to transfer ${u.name}'s workload to.`);
    const ok = window.confirm(
      `Move everything assigned to ${u.name} to ${to.name}?\n\n` +
        `• Bills waiting on ${u.name}'s approval\n• People reporting to ${u.name}\n• Bills ${u.name} owns or uploaded\n\n` +
        `${u.name} will have nothing left assigned.`,
    );
    if (!ok) return;
    run(
      () => adminApi.transferUser(u.id, toUserId),
      (d) =>
        `✓ Transferred to ${to.name}: ${d.approvals} pending approval(s), ${d.reports} report(s), ${d.bills} bill(s). ${u.name} now has nothing assigned.`,
    );
  };

  const removeUser = (u) => {
    if (!window.confirm(`Delete ${ROLE_NAME[u.role]} "${u.name}"?`)) return;
    run(() => adminApi.deleteUser(u.id), `✓ ${u.name} deleted.`);
  };

  return {
    users,
    locations,
    byRole,
    managersFor,
    message,
    actions: { createUser, changeRole, changeManager, changeLocation, transfer, removeUser },
  };
}
