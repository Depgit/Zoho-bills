import axios from 'axios';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL
        ? `${import.meta.env.VITE_API_BASE_URL}/api`
        : '/api',
});

api.interceptors.request.use(c => {
    const t = localStorage.getItem('token');
    if (t) c.headers.Authorization = 'Bearer ' + t;
    return c;
});

export const errMsg = e => e.response?.data?.error || e.message;