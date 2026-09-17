import { api } from './auth';

export const getTrendingGifs = () => api('/api/gifs/trending').then((d) => d.results || []);
export const searchGifs = (q) => api(`/api/gifs/search?q=${encodeURIComponent(q)}`).then((d) => d.results || []);
