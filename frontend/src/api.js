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

export const errMsg = e => (typeof e === 'string' ? e : e?.response?.data?.error || e?.message || 'Something went wrong');

// Every error in the app is shown in the popup rendered by <ErrorModal/> (App.jsx).
// Pass an axios error, an Error, or a plain message.
export const showError = e => window.dispatchEvent(new CustomEvent('app-error', { detail: errMsg(e) }));
