import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { socket } from '../api/socket';
import { listRows } from '../api/lists';
import { createPagedLoader } from '../utils/pagedLoader';

// `initial`: filters to load once on open, so the page never starts empty.
export function usePagedList(endpoint, event, initial) {
  const first = useRef(initial);
  const [state, setState] = useState({ rows: [], pagination: { page: 1, total: 0, totalPages: 0 }, loading: false, error: '', searched: false });
  const loader = useMemo(() => createPagedLoader(async (params, signal) => {
    const response = await api.get(endpoint, { params, signal });
    return { rows: listRows(response.data), pagination: response.data.pagination };
  }, patch => setState(previous => ({ ...previous, ...patch }))), [endpoint]);
  useEffect(() => {
    socket.on(event, loader.refresh);
    socket.on('connect', loader.refresh);
    if (first.current) loader.search(first.current);
    return () => {
      loader.cancel();
      socket.off(event, loader.refresh);
      socket.off('connect', loader.refresh);
    };
  }, [event, loader]);
  return { ...state, search: loader.search, goToPage: loader.page, refresh: loader.refresh };
}
