export const ROLE_NAME = {
  PM: 'Property Manager',
  CM: 'Cluster Manager',
  OM: 'Operations Manager',
  FM: 'Finance Manager',
  ADMIN: 'Admin',
};

// Who each role reports to (and so who approves their bills next)
export const MANAGER_ROLE = { PM: 'CM', CM: 'OM', OM: 'FM', FM: null };

export const STAFF_ROLES = ['PM', 'CM', 'OM', 'FM']; // roles the Admin can assign
export const TRANSFER_ROLES = ['CM', 'OM', 'FM']; // roles whose workload can be transferred

