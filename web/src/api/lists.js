import { api, getToken } from './auth';

export const getLists = (channelId) => api(`/api/channels/${encodeURIComponent(channelId)}/lists`);

export const createList = (channelId, { name, icon }) =>
  api(`/api/channels/${encodeURIComponent(channelId)}/lists`, {
    method: 'POST',
    body: JSON.stringify({ name, icon }),
  });

export const getList = (listId) => api(`/api/lists/${listId}`);

export const updateList = (listId, data) =>
  api(`/api/lists/${listId}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteList = (listId) => api(`/api/lists/${listId}`, { method: 'DELETE' });

export const createField = (listId, data) =>
  api(`/api/lists/${listId}/fields`, { method: 'POST', body: JSON.stringify(data) });

export const updateField = (fieldId, data) =>
  api(`/api/fields/${fieldId}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteField = (fieldId) => api(`/api/fields/${fieldId}`, { method: 'DELETE' });

export const reorderFields = (listId, order) =>
  api(`/api/lists/${listId}/fields/reorder`, { method: 'PUT', body: JSON.stringify({ order }) });

export const createItem = (listId, values, parentItemId) =>
  api(`/api/lists/${listId}/items`, { method: 'POST', body: JSON.stringify({ values, parent_item_id: parentItemId }) });

export const addMessageToList = (listId, messageId) =>
  api(`/api/lists/${listId}/items/from-message`, { method: 'POST', body: JSON.stringify({ message_id: messageId }) });

export const updateItem = (itemId, values) =>
  api(`/api/items/${itemId}`, { method: 'PUT', body: JSON.stringify({ values }) });

export const deleteItem = (itemId) => api(`/api/items/${itemId}`, { method: 'DELETE' });

export const reorderItems = (listId, order) =>
  api(`/api/lists/${listId}/items/reorder`, { method: 'PUT', body: JSON.stringify({ order }) });

export const getItemComments = (itemId) => api(`/api/items/${itemId}/comments`);

export const addItemComment = (itemId, body) =>
  api(`/api/items/${itemId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });

export const deleteItemComment = (commentId) =>
  api(`/api/item-comments/${commentId}`, { method: 'DELETE' });

export const importListCsv = (listId, { columns, rows }) =>
  api(`/api/lists/${listId}/import`, { method: 'POST', body: JSON.stringify({ columns, rows }) });

/** Not JSON — triggers a browser download of the exported CSV. */
export async function exportListCsv(listId, filename) {
  const token = getToken();
  const res = await fetch(`/api/lists/${listId}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'list.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
