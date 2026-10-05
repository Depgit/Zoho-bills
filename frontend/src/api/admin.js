// Admin: users and workload transfers
import { api } from './client.js';

export const listUsers = async () => (await api.get('/admin/users')).data;
export const createUser = (form) => api.post('/admin/users', form);
export const updateUser = async (id, patch) => (await api.patch(`/admin/users/${id}`, patch)).data;
export const transferUser = async (id, toUserId) => (await api.post(`/admin/users/${id}/transfer`, { toUserId })).data;
export const deleteUser = (id) => api.delete(`/admin/users/${id}`);
