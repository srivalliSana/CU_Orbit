import axios from 'axios';

const api = axios.create({
  baseURL: 'https://cumess.cutm.ac.in/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor to add stored user info if needed
api.interceptors.request.use((config) => {
  const session = localStorage.getItem('orbit_session');
  if (session) {
    const user = JSON.parse(session);
    config.headers['X-User-Phone'] = user.phone;
  }
  return config;
});

export default api;
