import { api } from './auth';

export const getLinkPreview = (url) => api(`/api/link-preview?url=${encodeURIComponent(url)}`);
