// Admin: users and workload transfers (changes invalidate the cached team / bill lists)
import { api } from './client.js';
import { invalidate } from './cache.js';

const changed = (result) => {
  invalidate('team');
  invalidate('assignable-pms');
  invalidate('bills:');
  return result;
};

export const listUsers = async () => (await api.get('/admin/users')).data;
export const createUser = async (form) => changed(await api.post('/admin/users', form));
export const updateUser = async (id, patch) => changed((await api.patch(`/admin/users/${id}`, patch)).data);
export const transferUser = async (id, toUserId) => changed((await api.post(`/admin/users/${id}/transfer`, { toUserId })).data);
export const deleteUser = async (id) => changed(await api.delete(`/admin/users/${id}`));
