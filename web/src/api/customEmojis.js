import { api, getToken } from './auth';

export const getCustomEmojis = () => api('/api/custom-emojis');

export const deleteCustomEmoji = (id) => api(`/api/custom-emojis/${id}`, { method: 'DELETE' });

export async function uploadCustomEmoji(name, file) {
  const form = new FormData();
  form.append('name', name);
  form.append('file', file);
  const token = getToken();
  const res = await fetch('/api/custom-emojis', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Upload failed');
  return data;
}
