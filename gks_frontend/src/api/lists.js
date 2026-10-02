import api from './axios';
export const listRows = body => Array.isArray(body) ? body : (body?.data ?? []);
export async function fetchAllUsers({ signal } = {}) {
  const rows = [];
  for (let page = 1; ; page++) {
    signal?.throwIfAborted();
    const response = await api.get('/users', { params: { page, limit: 500 }, signal });
    rows.push(...listRows(response.data));
    if (!response.data.pagination || page >= response.data.pagination.totalPages) return rows;
  }
}
