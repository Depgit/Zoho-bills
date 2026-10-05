// Sign-in and organisation registration
import { api } from './client.js';

export const login = async (email, password) => (await api.post('/auth/login', { email, password })).data;
export const registerOrg = async (form) => (await api.post('/auth/register', form)).data;
