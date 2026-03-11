import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    // Don't redirect for auth/me checks — let RequireAuth handle that via React Router
    const isAuthCheck = url.includes('/auth/me');
    if (
      error.response?.status === 401 &&
      !isAuthCheck &&
      window.location.pathname.startsWith('/admin') &&
      !window.location.pathname.includes('/admin/login')
    ) {
      window.location.href = '/admin/login';
    }
    // Extract server error message so UI shows it instead of generic "Request failed with status code 500"
    const serverMessage = error.response?.data?.error;
    if (serverMessage && typeof serverMessage === 'string') {
      error.message = serverMessage;
    }
    return Promise.reject(error);
  }
);
