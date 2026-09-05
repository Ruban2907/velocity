import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export const getApiBaseUrl = (): string => {
  if (typeof import.meta.env.VITE_API_URL === 'string') {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }
  return '';
};

const rawBaseUrl = getApiBaseUrl();
const baseURL = rawBaseUrl ? `${rawBaseUrl}/api` : '/api';

const api: AxiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = sessionStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isProfileUpdate = error.config?.url?.includes('/users/me') && error.config?.method === 'put';
      
      // Don't sign out on public pages
      const publicRoutes = ['/features', '/pricing', '/contact', '/technology', '/how-it-works', '/'];
      const isPublicRoute = publicRoutes.some(route => window.location.pathname === route);
      
      if (!isProfileUpdate && !isPublicRoute) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
